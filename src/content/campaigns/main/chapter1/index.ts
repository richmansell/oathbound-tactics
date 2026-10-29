/**
 * Chapter 1 — "The Split Penny". Beat order mirrors docs/story/chapters/chapter1.md.
 * Flags set by scenes: oaths_unlocked (c1.s16), c1_jory_defended | c1_jory_silent (c1.s08),
 * c1_jory_forgiven | c1_jory_shamed (c1.s18).
 */
import type { ChapterDef } from '../../../schema';

export const chapter1: ChapterDef = {
  id: 'c1',
  number: 1,
  title: 'The Split Penny',
  beats: [
    // Prologue
    { kind: 'scene', scene: 'c1.s01' },
    { kind: 'title', text: 'Chapter One', subtitle: 'The Split Penny' },

    // Act I — The Lantern Road
    { kind: 'battle', battle: 'c1_b1_lantern_road', at: 'lantern_road' },       // intro s02 · outro s03
    { kind: 'join', character: 'tamsin' },
    { kind: 'unlockNode', node: 'tallow_cross' },
    { kind: 'unlockNode', node: 'sallowmere' },                                    // skirmish
    { kind: 'scene', scene: 'c1.s04', at: 'tallow_cross' },
    { kind: 'join', character: 'hesper' },
    { kind: 'shop', shop: 'shop_tallow_cross', items: ['potion', 'antidote', 'eye_drops', 'phoenix_down', 'dagger', 'broadsword', 'oak_staff', 'shortbow', 'leather_cap', 'leather_armor', 'cloth_robe'] },
    { kind: 'scene', scene: 'c1.s05', at: 'tallow_cross' },
    { kind: 'scene', scene: 'c1.s06' },
    { kind: 'unlockNode', node: 'millers_cut' },
    { kind: 'battle', battle: 'c1_b2_millers_cut', at: 'millers_cut' },          // intro s07 · outro s08
    { kind: 'unlockNode', node: 'gibbet_hill' },                                   // skirmish
    { kind: 'unlockNode', node: 'millbrook' },
    { kind: 'battle', battle: 'c1_b3_millbrook', at: 'millbrook' },              // intro s09 · outro s10
    { kind: 'scene', scene: 'c1.s11' },                                            // cutaway: Ilka

    // The Turn
    { kind: 'unlockNode', node: 'sallow_ford' },
    { kind: 'leave', character: 'wat' },
    { kind: 'leave', character: 'merrit' },
    { kind: 'leave', character: 'odo' },                                           // Odo fights B4 as a guest ally
    { kind: 'battle', battle: 'c1_b4_sallow_ford', at: 'sallow_ford' },          // intro s12 · outro s13 (Odo dies)

    // Act II — The Greyfen
    { kind: 'unlockNode', node: 'saint_odile' },
    { kind: 'battle', battle: 'c1_b5_saint_odile', at: 'saint_odile' },          // intro s14 · outro s15
    { kind: 'join', character: 'aldous' },
    { kind: 'unlockNode', node: 'kingsbarrow' },                                   // skirmish
    { kind: 'unlockNode', node: 'tenpenny' },
    { kind: 'scene', scene: 'c1.s16', at: 'tenpenny' },                            // the Oathbound; sets oaths_unlocked
    { kind: 'battle', battle: 'c1_b6_tenpenny', at: 'tenpenny' },                // intro s17 · outro s18
    { kind: 'join', character: 'eira' },
    { kind: 'join', character: 'jory' },

    // Act III — The Split Penny
    { kind: 'unlockNode', node: 'hollin_tor' },
    { kind: 'scene', scene: 'c1.s19', at: 'hollin_tor' },
    { kind: 'battle', battle: 'c1_b7_hollin_tor', at: 'hollin_tor' },            // intro s20 · outro s21
    { kind: 'scene', scene: 'c1.s22' },
    { kind: 'leave', character: 'hesper' },
    { kind: 'scene', scene: 'c1.s23' },
    { kind: 'scene', scene: 'c1.s24' },                                            // sting: the Black Folio
    { kind: 'end', text: 'End of Chapter One — The Split Penny. To be continued in Chapter Two: The Unwritten.' },
  ],
};
