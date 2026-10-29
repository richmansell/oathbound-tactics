/**
 * Items: weapons, armour, accessories and consumables.
 * `tier` drives shop availability, enemy auto-equip and loot (1 = start of game).
 * `visual` lists the sprite layers drawn when the item is equipped.
 */
import type { ItemDef } from './types';
import type { LayerRef } from './schema';

const L = (key: string, color?: string, color2?: string): LayerRef => (color2 ? { key, color, color2 } : color ? { key, color } : { key });
const I: Record<string, ItemDef> = {};
function item(d: ItemDef): void { I[d.id] = d; }

type W = Omit<ItemDef, 'type' | 'category' | 'price'> & { price?: number };
function weapon(category: ItemDef['category'], d: W): void {
  item({ type: 'weapon', category, price: d.price ?? Math.round(80 * d.tier * d.tier + 120 * d.tier), ...d });
}
function armor(type: ItemDef['type'], category: ItemDef['category'], d: W): void {
  item({ type, category, price: d.price ?? Math.round(60 * d.tier * d.tier + 100 * d.tier), ...d });
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------
// Knives — (PA+SP)/2 × WP
weapon('knife', { id: 'dagger', name: 'Dagger', tier: 1, wp: 3, wev: 5, visual: [L('weapon_sword_dagger')] });
weapon('knife', { id: 'stiletto', name: 'Stiletto', tier: 2, wp: 4, wev: 5, visual: [L('weapon_sword_dagger')] });
weapon('knife', { id: 'kris', name: 'Wavy Kris', tier: 3, wp: 6, wev: 5, onHit: { status: 'poison', chance: 15 }, visual: [L('weapon_sword_dagger')] });
weapon('knife', { id: 'main_gauche', name: 'Main Gauche', tier: 4, wp: 7, wev: 40, visual: [L('weapon_sword_dagger')] });
weapon('knife', { id: 'nightfang', name: 'Nightfang', tier: 5, wp: 9, wev: 10, element: 'dark', rare: true, visual: [L('weapon_sword_dagger')] });

// Swords — PA × WP
weapon('sword', { id: 'bronze_sword', name: 'Bronze Sword', tier: 1, wp: 4, wev: 5, visual: [L('weapon_sword_arming', 'bronze')] });
weapon('sword', { id: 'iron_sword', name: 'Iron Sword', tier: 2, wp: 5, wev: 5, visual: [L('weapon_sword_arming', 'iron')] });
weapon('sword', { id: 'steel_sword', name: 'Steel Sword', tier: 3, wp: 7, wev: 8, visual: [L('weapon_sword_arming', 'steel')] });
weapon('sword', { id: 'sabre', name: 'Cavalry Sabre', tier: 3, wp: 7, wev: 10, visual: [L('weapon_sword_saber')] });
weapon('sword', { id: 'rapier', name: 'Duelling Rapier', tier: 4, wp: 8, wev: 20, visual: [L('weapon_sword_rapier')] });
weapon('sword', { id: 'scimitar', name: 'Desert Scimitar', tier: 4, wp: 9, wev: 10, visual: [L('weapon_sword_scimitar')] });
weapon('sword', { id: 'silvered_sword', name: 'Silvered Sword', tier: 5, wp: 10, wev: 10, element: 'holy', visual: [L('weapon_sword_arming', 'silver')] });
weapon('sword', { id: 'gilded_blade', name: 'Gilded Blade', tier: 6, wp: 12, wev: 10, bonus: { ma: 1 }, visual: [L('weapon_sword_arming', 'gold')] });
weapon('sword', { id: 'lumen_blade', name: 'Lumen Blade', tier: 7, wp: 14, wev: 15, element: 'holy', rare: true, visual: [L('weapon_sword_glowsword', 'blue')] });
weapon('sword', { id: 'emberbrand', name: 'Emberbrand', tier: 7, wp: 14, wev: 15, element: 'fire', rare: true, visual: [L('weapon_sword_glowsword', 'red')] });

// Knightswords — PA × WP, stronger, Knights/Oathbreakers
weapon('knightsword', { id: 'longsword', name: 'Longsword', tier: 3, wp: 9, wev: 10, visual: [L('weapon_sword_longsword')] });
weapon('knightsword', { id: 'bastard_sword', name: 'Bastard Sword', tier: 4, wp: 11, wev: 10, visual: [L('weapon_sword_longsword')] });
weapon('knightsword', { id: 'oathkeeper', name: 'Oathkeeper', tier: 6, wp: 14, wev: 15, bonus: { brave: 5 }, rare: true, visual: [L('weapon_sword_longsword')] });
weapon('knightsword', { id: 'kingsbane', name: 'Kingsbane', tier: 8, wp: 18, wev: 15, element: 'dark', rare: true, visual: [L('weapon_sword_longsword')] });

// Katana — PA × WP × Brave/100
weapon('katana', { id: 'ashblade', name: 'Ashblade', tier: 3, wp: 9, wev: 15, visual: [L('weapon_sword_katana')] });
weapon('katana', { id: 'moonsteel', name: 'Moonsteel Katana', tier: 5, wp: 12, wev: 15, visual: [L('weapon_sword_katana')] });
weapon('katana', { id: 'kotetsu', name: 'Riverwind', tier: 7, wp: 15, wev: 15, element: 'wind', rare: true, visual: [L('weapon_sword_katana')] });

// Axes — rand(1..PA) × WP
weapon('axe', { id: 'hand_axe', name: 'Hand Axe', tier: 1, wp: 5, visual: [L('weapon_blunt_waraxe')] });
weapon('axe', { id: 'battle_axe', name: 'Battle Axe', tier: 3, wp: 7, visual: [L('weapon_blunt_waraxe')] });
weapon('axe', { id: 'giants_axe', name: 'Giant\'s Axe', tier: 5, wp: 9, visual: [L('weapon_blunt_waraxe')] });
weapon('axe', { id: 'slasher', name: 'Woodsman\'s Grief', tier: 7, wp: 11, onHit: { status: 'slow', chance: 15 }, rare: true, visual: [L('weapon_blunt_waraxe')] });

// Flails / maces — rand(1..PA) × WP
weapon('flail', { id: 'club', name: 'Cudgel', tier: 1, wp: 5, visual: [L('weapon_blunt_club')] });
weapon('flail', { id: 'mace', name: 'Iron Mace', tier: 2, wp: 6, visual: [L('weapon_blunt_mace')] });
weapon('flail', { id: 'morning_star', name: 'Morning Star', tier: 4, wp: 8, visual: [L('weapon_blunt_flail')] });
weapon('flail', { id: 'scorpion_tail', name: 'Penitent\'s Flail', tier: 6, wp: 10, rare: true, visual: [L('weapon_blunt_flail')] });

// Spears — PA × WP, range 2 line
weapon('spear', { id: 'javelin', name: 'Javelin', tier: 1, wp: 6, wev: 10, visual: [L('weapon_polearm_spear', 'iron')] });
weapon('spear', { id: 'spear', name: 'Spear', tier: 2, wp: 8, wev: 10, visual: [L('weapon_polearm_spear', 'steel')] });
weapon('spear', { id: 'partisan', name: 'Partisan', tier: 3, wp: 10, wev: 10, visual: [L('weapon_polearm_longspear', 'steel')] });
weapon('spear', { id: 'trident', name: 'Trident', tier: 4, wp: 11, wev: 10, element: 'water', visual: [L('weapon_polearm_trident', 'silver')] });
weapon('spear', { id: 'halberd', name: 'Halberd', tier: 5, wp: 13, wev: 10, visual: [L('weapon_polearm_halberd')] });
weapon('spear', { id: 'dragoon_lance', name: 'Skyreaver Lance', tier: 7, wp: 16, wev: 15, rare: true, visual: [L('weapon_polearm_dragonspear', 'gold')] });

// Staves — MA × WP
weapon('staff', { id: 'oak_staff', name: 'Oak Staff', tier: 1, wp: 3, wev: 10, bonus: { ma: 1 }, visual: [L('weapon_magic_simple')] });
weapon('staff', { id: 'white_staff', name: 'Pilgrim\'s Staff', tier: 2, wp: 3, wev: 15, bonus: { ma: 1 }, proc: { ability: 'cure', chance: 15 }, visual: [L('weapon_magic_gnarled', 'light')] });
weapon('staff', { id: 'serpent_staff', name: 'Serpent Staff', tier: 3, wp: 4, wev: 15, bonus: { ma: 2 }, visual: [L('weapon_magic_s', 'silver')] });
weapon('staff', { id: 'sage_staff', name: 'Sage\'s Staff', tier: 5, wp: 5, wev: 20, bonus: { ma: 3 }, visual: [L('weapon_magic_loop', 'gold')] });
weapon('staff', { id: 'ledger_crozier', name: 'Ledger Crozier', tier: 7, wp: 6, wev: 20, bonus: { ma: 4, faith: 10 }, rare: true, visual: [L('weapon_magic_diamond', 'gold')] });

// Rods — PA × WP; elemental, can proc spells
weapon('rod', { id: 'rod', name: 'Apprentice Rod', tier: 1, wp: 3, wev: 10, bonus: { ma: 1 }, visual: [L('weapon_magic_wand')] });
weapon('rod', { id: 'flame_rod', name: 'Flame Rod', tier: 2, wp: 3, element: 'fire', proc: { ability: 'fire', chance: 20 }, bonus: { ma: 1 }, visual: [L('weapon_magic_crystal', 'red')] });
weapon('rod', { id: 'ice_rod', name: 'Frost Rod', tier: 2, wp: 3, element: 'ice', proc: { ability: 'blizzard', chance: 20 }, bonus: { ma: 1 }, visual: [L('weapon_magic_crystal', 'blue')] });
weapon('rod', { id: 'thunder_rod', name: 'Storm Rod', tier: 2, wp: 3, element: 'lightning', proc: { ability: 'thunder', chance: 20 }, bonus: { ma: 1 }, visual: [L('weapon_magic_crystal', 'yellow')] });
weapon('rod', { id: 'verdant_rod', name: 'Verdant Rod', tier: 4, wp: 4, bonus: { ma: 2 }, visual: [L('weapon_magic_crystal', 'green')] });
weapon('rod', { id: 'void_rod', name: 'Void Rod', tier: 6, wp: 5, element: 'dark', bonus: { ma: 3 }, rare: true, visual: [L('weapon_magic_crystal', 'purple')] });

// Bows — (PA+SP)/2 × WP, long range, min range 2 (can't shoot adjacent)
weapon('bow', { id: 'shortbow', name: 'Shortbow', tier: 1, wp: 4, twoHanded: true, visual: [L('weapon_ranged_bow_normal', 'medium')] });
weapon('bow', { id: 'hunting_bow', name: 'Hunting Bow', tier: 2, wp: 5, twoHanded: true, visual: [L('weapon_ranged_bow_normal', 'dark')] });
weapon('bow', { id: 'recurve_bow', name: 'Recurve Bow', tier: 3, wp: 6, twoHanded: true, visual: [L('weapon_ranged_bow_recurve', 'medium')] });
weapon('bow', { id: 'longbow', name: 'Longbow', tier: 4, wp: 8, twoHanded: true, range: 6, visual: [L('weapon_ranged_bow_great', 'medium')] });
weapon('bow', { id: 'silver_bow', name: 'Silver Bow', tier: 5, wp: 9, twoHanded: true, element: 'holy', visual: [L('weapon_ranged_bow_recurve', 'silver')] });
weapon('bow', { id: 'gale_bow', name: 'Galestring', tier: 7, wp: 12, twoHanded: true, element: 'wind', range: 6, rare: true, visual: [L('weapon_ranged_bow_great', 'gold')] });

// Crossbows — PA × WP, range 4
weapon('crossbow', { id: 'light_crossbow', name: 'Light Crossbow', tier: 1, wp: 4, twoHanded: true, visual: [L('weapon_ranged_crossbow')] });
weapon('crossbow', { id: 'arbalest', name: 'Arbalest', tier: 3, wp: 6, twoHanded: true, visual: [L('weapon_ranged_crossbow')] });
weapon('crossbow', { id: 'siege_crossbow', name: 'Siege Crossbow', tier: 5, wp: 9, twoHanded: true, visual: [L('weapon_ranged_crossbow')] });

// ---------------------------------------------------------------------------
// Shields (off hand)
// ---------------------------------------------------------------------------
armor('shield', 'shield', { id: 'buckler', name: 'Buckler', tier: 1, pev: 10, mev: 3, visual: [L('shield_round', 'brown')] });
armor('shield', 'shield', { id: 'round_shield', name: 'Round Shield', tier: 2, pev: 13, mev: 5, visual: [L('shield_round', 'silver')] });
armor('shield', 'shield', { id: 'heater_shield', name: 'Heater Shield', tier: 3, pev: 16, mev: 8, visual: [L('shield_heater_revised_wood', 'oak'), L('shield_heater_revised_trim', 'steel')] });
armor('shield', 'shield', { id: 'kite_shield', name: 'Kite Shield', tier: 4, pev: 19, mev: 10, visual: [L('shield_kite', 'kite_blue_gray')] });
armor('shield', 'shield', { id: 'tower_shield', name: 'Tower Shield', tier: 5, pev: 24, mev: 6, visual: [L('shield_scutum')] });
armor('shield', 'shield', { id: 'crusader_shield', name: 'Pilgrim\'s Aegis', tier: 6, pev: 22, mev: 18, elements: { half: ['holy', 'dark'] }, visual: [L('shield_crusader')] });
armor('shield', 'shield', { id: 'spartan_shield', name: 'Bronze Hoplon', tier: 4, pev: 20, mev: 8, visual: [L('shield_spartan')] });

// ---------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------
armor('head', 'hat', { id: 'leather_cap', name: 'Leather Cap', tier: 1, hp: 8, visual: [L('hat_cap_leather', 'leather')] });
armor('head', 'hat', { id: 'hood', name: 'Traveller\'s Hood', tier: 1, hp: 6, mp: 4, visual: [L('hat_hood_cloth', 'brown')], hidesHair: true });
armor('head', 'hat', { id: 'bandana', name: 'Bandana', tier: 2, hp: 10, bonus: { sp: 0 }, visual: [L('hat_bandana', 'red')] });
armor('head', 'hat', { id: 'feathered_cap', name: 'Feathered Cap', tier: 2, hp: 14, mp: 4, visual: [L('hat_cap_bonnie_feather', 'leather')] });
armor('head', 'hat', { id: 'wizard_hat', name: 'Wizard\'s Hat', tier: 2, hp: 12, mp: 8, bonus: { ma: 1 }, visual: [L('hat_magic_wizard', 'blue')] });
armor('head', 'hat', { id: 'headband', name: 'Monk\'s Headband', tier: 3, hp: 18, bonus: { pa: 1 }, visual: [L('hat_headband_tied', 'red')] });
armor('head', 'hat', { id: 'cavalier_hat', name: 'Cavalier Hat', tier: 3, hp: 22, mp: 6, bonus: { sp: 1 }, visual: [L('hat_cap_cavalier', 'maroon')] });
armor('head', 'hat', { id: 'celestial_hat', name: 'Celestial Hat', tier: 4, hp: 22, mp: 14, bonus: { ma: 2 }, visual: [L('hat_magic_celestial', 'navy')] });
armor('head', 'hat', { id: 'moon_hat', name: 'Starseer\'s Hat', tier: 6, hp: 30, mp: 22, bonus: { ma: 3 }, rare: true, visual: [L('hat_magic_celestial_moon', 'purple')] });
armor('head', 'hat', { id: 'circlet', name: 'Silver Circlet', tier: 5, hp: 36, mp: 12, bonus: { ma: 1, faith: 5 }, visual: [L('hat_headband_thick_rune', 'gray')] });

armor('head', 'helm', { id: 'mail_coif', name: 'Mail Coif', tier: 1, hp: 12, visual: [L('hat_helmet_mail', 'iron')], hidesHair: true });
armor('head', 'helm', { id: 'nasal_helm', name: 'Nasal Helm', tier: 2, hp: 18, visual: [L('hat_helmet_nasal', 'iron')], hidesHair: true });
armor('head', 'helm', { id: 'kettle_helm', name: 'Kettle Hat', tier: 2, hp: 20, visual: [L('hat_helmet_kettle', 'steel')], hidesHair: true });
armor('head', 'helm', { id: 'spangenhelm', name: 'Spangenhelm', tier: 3, hp: 26, visual: [L('hat_helmet_spangenhelm', 'steel')], hidesHair: true });
armor('head', 'helm', { id: 'bascinet', name: 'Bascinet', tier: 3, hp: 30, visual: [L('hat_helmet_bascinet', 'steel')], hidesHair: true });
armor('head', 'helm', { id: 'barbuta', name: 'Barbuta', tier: 4, hp: 38, visual: [L('hat_helmet_barbuta', 'steel')], hidesHair: true });
armor('head', 'helm', { id: 'armet', name: 'Armet', tier: 5, hp: 48, visual: [L('hat_helmet_armet', 'steel')], hidesHair: true });
armor('head', 'helm', { id: 'greathelm', name: 'Great Helm', tier: 6, hp: 60, visual: [L('hat_helmet_greathelm', 'silver'), L('hat_accessory_crest', 'gold')], hidesHair: true });
armor('head', 'helm', { id: 'horned_helm', name: 'Horned Helm', tier: 4, hp: 40, bonus: { pa: 1 }, visual: [L('hat_helmet_horned', 'iron')], hidesHair: true });
armor('head', 'helm', { id: 'morion', name: 'Morion', tier: 3, hp: 28, visual: [L('hat_helmet_morion', 'steel')], hidesHair: true });
armor('head', 'helm', { id: 'dragon_helm', name: 'Wyrmscale Helm', tier: 7, hp: 70, rare: true, elements: { half: ['fire'] }, visual: [L('hat_helmet_close', 'gold'), L('hat_accessory_wings', 'gold')], hidesHair: true });
armor('head', 'helm', { id: 'black_helm', name: 'Oathless Visor', tier: 6, hp: 58, rare: true, visual: [L('hat_helmet_sugarloaf', 'iron')], hidesHair: true });

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------
armor('body', 'clothes', { id: 'tunic', name: 'Padded Tunic', tier: 1, hp: 10, visual: [L('torso_clothes_tunic', 'brown')] });
armor('body', 'clothes', { id: 'leather_jerkin', name: 'Leather Jerkin', tier: 2, hp: 18, visual: [L('torso_armour_leather', 'leather', 'brass')] });
armor('body', 'clothes', { id: 'travellers_coat', name: 'Traveller\'s Coat', tier: 2, hp: 16, mp: 4, visual: [L('torso_jacket_trench')] });
armor('body', 'clothes', { id: 'brigandine', name: 'Brigandine', tier: 3, hp: 28, visual: [L('torso_armour_leather', 'black', 'steel'), L('arms_bracers', 'leather')] });
armor('body', 'clothes', { id: 'rangers_garb', name: 'Ranger\'s Garb', tier: 3, hp: 26, bonus: { sp: 0 }, visual: [L('torso_armour_leather', 'forest', 'bronze'), L('cape_solid', 'forest')] });
armor('body', 'clothes', { id: 'shadow_garb', name: 'Shadow Garb', tier: 5, hp: 40, pev: 5, visual: [L('torso_armour_leather', 'black', 'iron'), L('arms_gloves', 'black')] });
armor('body', 'clothes', { id: 'power_garb', name: 'Battle Gi', tier: 4, hp: 34, bonus: { pa: 1 }, visual: [L('torso_clothes_sleeveless2', 'white'), L('belt_sash', 'black')] });

armor('body', 'robe', { id: 'linen_robe', name: 'Linen Robe', tier: 1, hp: 8, mp: 8, visual: [L('torso_clothes_robe', 'brown')] });
armor('body', 'robe', { id: 'silk_robe', name: 'Silk Robe', tier: 2, hp: 14, mp: 14, visual: [L('torso_clothes_robe', 'blue')] });
armor('body', 'robe', { id: 'clerics_vestment', name: 'Cleric\'s Vestment', tier: 3, hp: 22, mp: 20, bonus: { faith: 5 }, visual: [L('torso_clothes_robe', 'white'), L('neck_amulet_cross', 'gold_red')] });
armor('body', 'robe', { id: 'black_robe', name: 'Black Robe', tier: 4, hp: 26, mp: 26, bonus: { ma: 1 }, visual: [L('torso_clothes_robe', 'black')] });
armor('body', 'robe', { id: 'scholars_robe', name: 'Scholar\'s Robe', tier: 5, hp: 34, mp: 34, bonus: { ma: 2 }, visual: [L('torso_clothes_robe', 'purple'), L('belt_mage')] });
armor('body', 'robe', { id: 'ledger_robe', name: 'Robe of the Ledger', tier: 7, hp: 50, mp: 50, bonus: { ma: 3, faith: 10 }, rare: true, visual: [L('torso_clothes_robe', 'red'), L('cape_trim', 'white', 'yellow')] });

armor('body', 'armor', { id: 'chain_shirt', name: 'Chain Shirt', tier: 1, hp: 20, visual: [L('torso_chainmail', 'iron')] });
armor('body', 'armor', { id: 'chainmail', name: 'Chainmail', tier: 2, hp: 30, visual: [L('torso_chainmail', 'steel'), L('torso_jacket_tabard', 'navy')] });
armor('body', 'armor', { id: 'legion_armor', name: 'Lamellar', tier: 3, hp: 42, visual: [L('torso_armour_legion', 'steel'), L('shoulders_legion', 'steel')] });
armor('body', 'armor', { id: 'half_plate', name: 'Half Plate', tier: 4, hp: 56, visual: [L('torso_armour_plate', 'steel'), L('arms_armour', 'steel')] });
armor('body', 'armor', { id: 'plate_armor', name: 'Plate Armour', tier: 5, hp: 72, visual: [L('torso_armour_plate', 'steel'), L('arms_armour', 'steel'), L('legs_armour', 'steel'), L('feet_armour', 'steel')] });
armor('body', 'armor', { id: 'gilded_plate', name: 'Gilded Plate', tier: 6, hp: 88, bonus: { ma: 1 }, visual: [L('torso_armour_plate', 'gold'), L('arms_armour', 'gold'), L('legs_armour', 'gold'), L('feet_armour', 'gold')] });
armor('body', 'armor', { id: 'black_plate', name: 'Hollow Plate', tier: 7, hp: 100, rare: true, elements: { half: ['dark'] }, visual: [L('torso_armour_plate', 'iron'), L('arms_armour', 'iron'), L('legs_armour', 'iron'), L('feet_armour', 'iron'), L('cape_tattered', 'black')] });

// ---------------------------------------------------------------------------
// Accessories
// ---------------------------------------------------------------------------
armor('accessory', 'cloak', { id: 'wool_cloak', name: 'Wool Cloak', tier: 1, pev: 5, mev: 5, visual: [L('cape_solid', 'gray')] });
armor('accessory', 'cloak', { id: 'elven_cloak', name: 'Greenwood Cloak', tier: 3, pev: 12, mev: 8, visual: [L('cape_solid', 'forest')] });
armor('accessory', 'cloak', { id: 'crimson_cloak', name: 'Crimson Mantle', tier: 4, pev: 10, mev: 10, bonus: { brave: 5 }, visual: [L('cape_trim', 'red', 'yellow')] });
armor('accessory', 'cloak', { id: 'shadow_cloak', name: 'Shade Cloak', tier: 6, pev: 18, mev: 12, visual: [L('cape_tattered', 'black')] });
armor('accessory', 'boots', { id: 'battle_boots', name: 'Battle Boots', tier: 2, bonus: { move: 1 }, visual: [L('feet_boots_revised', 'brown')] });
armor('accessory', 'boots', { id: 'spiked_boots', name: 'Climbing Boots', tier: 3, bonus: { jump: 1 }, visual: [L('feet_boots_rim', 'black')] });
armor('accessory', 'boots', { id: 'swift_boots', name: 'Windrunner Boots', tier: 6, bonus: { move: 2, jump: 1 }, rare: true, visual: [L('feet_boots_fold', 'sky')] });
armor('accessory', 'armlet', { id: 'power_gauntlet', name: 'Power Gauntlet', tier: 3, bonus: { pa: 2 }, visual: [L('arms_gloves', 'brown')] });
armor('accessory', 'armlet', { id: 'iron_bracers', name: 'Iron Bracers', tier: 2, hp: 10, pev: 3, visual: [L('arms_bracers', 'leather')] });
armor('accessory', 'ring', { id: 'magick_ring', name: 'Magick Ring', tier: 3, bonus: { ma: 2 }, visual: [] });
armor('accessory', 'ring', { id: 'reflect_ring', name: 'Mirror Ring', tier: 5, autoStatus: ['reflect'], visual: [] });
armor('accessory', 'ring', { id: 'angel_ring', name: 'Phoenix Ring', tier: 6, autoStatus: ['reraise'], rare: true, visual: [] });
armor('accessory', 'accessory', { id: 'amulet_protect', name: 'Ward Amulet', tier: 3, autoStatus: ['protect'], visual: [L('neck_amulet_cross', 'silver_blue')] });
armor('accessory', 'accessory', { id: 'amulet_shell', name: 'Spell Amulet', tier: 3, autoStatus: ['shell'], visual: [L('neck_amulet_cross', 'gold_blue')] });
armor('accessory', 'accessory', { id: 'speed_charm', name: 'Quicksilver Charm', tier: 4, bonus: { sp: 1 }, visual: [L('neck_necklace', 'silver')] });
armor('accessory', 'accessory', { id: 'ribbon', name: 'Ribbon', tier: 8, immune: ['poison', 'blind', 'silence', 'sleep', 'confuse', 'charm', 'berserk', 'doom', 'petrify', 'stop', 'slow', 'immobilize', 'disable'], rare: true, visual: [L('hat_headband_hairtie', 'red')] });
armor('accessory', 'accessory', { id: 'germinas', name: 'Twin Charms', tier: 4, bonus: { pa: 1, ma: 1 }, visual: [L('neck_amulet_cross', 'gold_red')] });
armor('accessory', 'accessory', { id: 'oath_token', name: 'Oath Token', tier: 2, bonus: { brave: 3, faith: 3 }, visual: [L('neck_necklace', 'brass')] });
armor('accessory', 'accessory', { id: 'pearl_pendant', name: 'Pearl Pendant', tier: 3, elements: { half: ['ice', 'water'] }, visual: [L('neck_amulet_cross', 'silver_green')] });
armor('accessory', 'accessory', { id: 'flame_pendant', name: 'Salamander Pendant', tier: 3, elements: { half: ['fire'] }, visual: [L('neck_amulet_cross', 'steel_red')] });

// ---------------------------------------------------------------------------
// Consumables
// ---------------------------------------------------------------------------
const use = (id: string, name: string, price: number, tier: number, effects: ItemDef['effects'], description: string, targetsKO = false) =>
  item({ id, name, type: 'consumable', category: 'consumable', price, tier, effects, description, targetsKO });
use('potion', 'Potion', 50, 1, [{ type: 'heal', formula: { kind: 'fixed', amount: 30 } }], 'Restores 30 HP.');
use('hi_potion', 'Hi-Potion', 200, 2, [{ type: 'heal', formula: { kind: 'fixed', amount: 70 } }], 'Restores 70 HP.');
use('x_potion', 'X-Potion', 700, 4, [{ type: 'heal', formula: { kind: 'fixed', amount: 150 } }], 'Restores 150 HP.');
use('ether', 'Ether', 200, 2, [{ type: 'heal', formula: { kind: 'fixed', amount: 20 }, mp: true }], 'Restores 20 MP.');
use('hi_ether', 'Hi-Ether', 600, 4, [{ type: 'heal', formula: { kind: 'fixed', amount: 50 }, mp: true }], 'Restores 50 MP.');
use('elixir', 'Elixir', 5000, 7, [{ type: 'heal', formula: { kind: 'pctMax', pct: 100 } }, { type: 'heal', formula: { kind: 'pctMax', pct: 100 }, mp: true }], 'Fully restores HP and MP.');
use('antidote', 'Antidote', 30, 1, [{ type: 'removeStatus', status: ['poison'] }], 'Cures Poison.');
use('eye_drops', 'Eye Drops', 40, 1, [{ type: 'removeStatus', status: ['blind'] }], 'Cures Blind.');
use('echo_herbs', 'Echo Herbs', 60, 2, [{ type: 'removeStatus', status: ['silence'] }], 'Cures Silence.');
use('gold_needle', 'Gold Needle', 100, 2, [{ type: 'removeStatus', status: ['petrify'] }], 'Cures Stone.');
use('holy_water', 'Holy Water', 300, 3, [{ type: 'removeStatus', status: ['undead', 'doom'] }], 'Cures Undead and Doom. Harms the restless dead.');
use('remedy', 'Remedy', 400, 3, [{ type: 'removeStatus', status: ['poison', 'blind', 'silence', 'petrify', 'confuse', 'sleep', 'berserk', 'oil', 'immobilize', 'disable', 'slow', 'charm'] }], 'Cures most ailments.');
use('phoenix_down', 'Phoenix Down', 300, 1, [{ type: 'revive', pct: 25 }], 'Revives a fallen ally with a quarter of max HP.', true);

export const ITEMS: Record<string, ItemDef> = I;

export function itemDef(id: string): ItemDef {
  const d = I[id];
  if (!d) throw new Error(`Unknown item: ${id}`);
  return d;
}

export function registerItems(defs: ItemDef[]): void {
  for (const d of defs) I[d.id] = d;
}

/** Map an ability-consumable id → potion heal amount ordering for Auto-Potion. */
export const POTION_ORDER = ['x_potion', 'hi_potion', 'potion'];
