# Schema & Engine Requests (from the story team)

`src/content/schema.ts` was **not** edited. Everything below is either a requested schema change or a
convention the main campaign data already relies on. Items are ordered by how much Chapter 1 needs them.
Current data type-checks against the existing schema; workarounds are noted.

## A. Needed for Chapter 1 to play as written

1. **Job unlock beat.** Bren gains the `lanternbearer` job when Odo dies (after `c1.s13`).
   Request: `StoryBeat | { kind: 'unlockJob'; character: string; job: string }`.
   *Workaround:* none in data; engine should unlock it after battle `c1_b4_sallow_ford`.
2. **Feature unlock via flag.** The Oath system unlocks when scene `c1.s16` sets flag `oaths_unlocked`.
   Request: engine reads that flag (or add `StoryBeat | { kind: 'flag'; set: string }` / `{ kind: 'unlockFeature'; feature: 'oaths' }`).
3. **Retreating bosses.** Jory (B2) and Ilka (B3) withdraw rather than die at 0 HP; Crane (B6) dies.
   Request: `BattleUnitSpawn.retreatAt?: number` (HP %), or `onDefeat?: 'retreat' | 'die'`.
4. **Untargetable unit.** Morrow is present in B4 but must not be fought (he is L9).
   Request: `BattleUnitSpawn.untargetable?: boolean` (and `immobile?: boolean`). *Workaround:* `ai: 'guard'` at the far corner.
5. **Escape with specific units.** B4: the battle is won when Bren **and** Hesper reach the north edge.
   Request: `{ type: 'escape'; tiles; who?: string[] }` (mirrors `reach.who`). *Workaround:* `defeat: [protect bren, protect hesper]`.
6. **Trigger unit references.** `BattleTrigger.when.unit` is used for **spawn ids** (`jory_b2`, `ilka_b3`, `odo_b4`…)
   **and for party character ids** for deployed members (`hesper`, `odo` in B1). Please support both
   (spawn id first, then character id). Same for `victory.target` / `defeat[].target`.
7. **`tileReached` for a single unit.** B4 `s60` / B7 `s77` are written for Bren. Request `tileReached.unit?: string`.
   *Workaround:* `team: 'player'`.
8. **Conditional beats.** Jory's recruitment is unconditional now, but the choice flags
   (`c1_jory_defended/silent`, `c1_jory_forgiven/shamed`) should colour Chapter 2.
   Request: `ifFlag?` / `ifNotFlag?` on every `StoryBeat`.
9. **Skeleton/zombie bodies.** `BodyType` lacks the LPC skeleton/zombie bodies. Request
   `BodyType = 'male' | 'female' | 'muscular' | 'skeleton' | 'zombie'`.
   *Workaround:* `enemies.ts` exports `bodyOverride` (template id → 'skeleton' | 'zombie').
10. **CampaignPack companions.** Maps, enemy templates and generator regions live beside the pack
    (`main/index.ts` exports `maps`, `enemies`, `bodyOverride`, `regions`, `KMU_TO_TILES`).
    Request: `CampaignPack.maps`, `CampaignPack.enemies`, `CampaignPack.regions`, `CampaignPack.shops`, `CampaignPack.items`.
    `MapDef`/`PropType` are declared at the top of `main/maps.ts` as instructed — please move them to a shared module.

## B. Scene / dialogue conventions the data relies on

11. **Actor ids = character ids.** Every `stage` step's `actor` is a character id. `place` may introduce an
    actor not listed in `SceneDef.actors` (e.g. `[place tamsin 1 6 e]` in `c1.s02`); the engine should
    spawn that character.
12. **Map-less scenes** use only `music`, `sfx`, `background`, `fade`, `flash`, `shake`, `wait`. `background`
    values are location ids. `fade` values: `'in'` / `'out'`.
13. **Emote/anim values used:** emote `!`, `...`, `anger`, `heart`, `sweat`; anim `hurt`, `slash`, `emote`
    (used for kneeling — a `kneel` anim would be better: please add to the documented list).
14. **Sung lines.** The lark lullaby (`c1.s05.0xx`, `c1.s19.002`) is sung. Request `style: 'sung'`
    (currently `whisper` + a direction note).
15. **Choice ids** use the VO id format (`main.c1.s08.0NN`) for uniqueness; they are not voiced.
16. **Generic speakers** may be enemy template ids (`struck_brigand`, `highwayman`); the portrait is the
    template's appearance.
17. **Child portraits.** `lark`, `bren_young`, `hesper_young`, `pim` need child-proportioned portraits.
    Request `PortraitExtras.age: 'child'` (currently `'young'` + a `markings` note).
18. **Face accessories.** Glasses (Morrow, Anselm) and eyepatches have no `OutfitSlot`. Request `'face'`.
19. **Trigger ordering.** When a `victory` trigger has a scene (B3 `s54`, B6 `s73`), play it **before** the
    battle's `outroScene`.
20. **Skirmish intros** (`s85–s87`) are `once: true` — once per save, not once per run.
21. **Guests vs. party.** Odo leaves the party before B4 and fights as a guest ally (`odo_b4`). Tamsin (B1),
    Aldous (B5), Eira and Jory (B6) appear as guests before their `join` beats; the same character must not
    be deployable and spawned at once.

## C. Content the engine/audio/items owners need to create

- **Story & monster jobs, signature items, Chapter 1 Oaths:** see `STORY_JOBS.md`.
- **Item ids referenced** (rewards, shop): `potion`, `hi_potion`, `ether`, `antidote`, `eye_drops`, `remedy`,
  `holy_water`, `phoenix_down`, `dagger`, `broadsword`, `iron_sword`, `oak_staff`, `shortbow`, `longbow`,
  `leather_cap`, `leather_armor`, `chain_vest`, `cloth_robe`, `brask_lantern`, `auditor_warrant`.
  Shop id: `shop_tallow_cross`.
- **Music ids:** `cold_open`, `storm`, `lantern_road`, `after_battle`, `tavern`, `rooftop`, `memory`,
  `road_day`, `tension_low`, `millbrook`, `night_quiet`, `ashguard_theme`, `night_tension`, `odo_theme`,
  `silence`, `greyfen`, `aldous_theme`, `tenpenny`, `confession`, `campfire`, `morrow_theme`, `revelation`,
  `regent_theme`, `oathbound_theme`, `clement_theme`, battle: `battle_hollows`, `battle_bandits`,
  `battle_ashguard`, `battle_escape`, `battle_undead`, `battle_ledger`, `battle_boss`.
- **SFX ids:** `bell`, `box`, `candle_flare`, `chime`, `coin`, `cough`, `door`, `fire`, `heal`, `hollow_shriek`,
  `hooves`, `horn`, `horses`, `howl`, `hum`, `impact`, `ink`, `knife`, `lantern`, `lantern_flare`, `lock`,
  `pages`, `paper`, `pen_strike`, `punt`, `quill`, `quill_scratch`, `rain`, `scream`, `sword`, `thunder`,
  `water`, `whistle`.

## D. Nice to have

- **Currency name.** The fiction uses pennies/marks/crowns (BIBLE §4.4). Request renaming `rewards.gil` to
  `rewards.money` and labelling the UI currency "marks".
- **World regions** (`world.ts → regions`) for the procedural generator: KMU boxes (1 KMU = 4 world tiles),
  biome, danger, roaming templates, weather, chapter gating. Consider a `WorldRegion` type in the schema.
- **Map deploy zones** could live on `MapDef` (`deploy?: [number, number][]`) so skirmishes generated from
  the overworld can reuse authored sites.
