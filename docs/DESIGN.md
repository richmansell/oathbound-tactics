# Oathbound Tactics — Game Design Document

> Working title. An original isometric tactics RPG that learns from *Final Fantasy Tactics*
> (job mixing, CT turn order, height, facing, Brave/Faith) and builds its own identity on top:
> **Oaths**, an online-first architecture, and campaign packs.

## 1. Product pillars

1. **Tactics that reward thinking.** Height, facing, charge times, reactions and turn order all matter.
2. **Build-crafting.** Every unit learns abilities across jobs and keeps them forever; any learned
   skillset can be slotted as a secondary. Loadouts are per character and saved.
3. **You can see what you wear.** Characters are composited from layered sprite sheets; every weapon,
   helmet, armour and cloak is visible on the battlefield. This is also the cosmetics/cash-shop surface
   (dyes, cloaks, alternate looks) — cosmetics never change stats.
4. **Story with weight.** Fully written, voice-ready dialogue with talking-head portraits.
5. **Two ways to play.** Story mode (base campaign + purchasable campaign packs) and online play
   (PvP and co-op), sharing one deterministic rules engine.
6. **Everywhere.** Web first, wrapped for iOS/Android. Touch-first UI that also works with mouse and keyboard.

## 2. Architecture

```
src/engine   Pure TypeScript rules engine. No DOM. Deterministic (seeded RNG in state),
             serialisable state, every change goes through a Command. Runs in browser,
             Node (server) and tests. This is what online play will run server-side.
src/content  Data: jobs, abilities, items, statuses, monsters, maps, campaign packs.
src/game     Meta-game: roster, progression, save slots, campaign flow, shop.
src/render   Canvas isometric renderer, sprite compositor, VFX, camera.
src/ui       Preact UI: menus, battle HUD, dialogue with talking heads.
src/audio    WebAudio music + SFX.
src/portraits Talking-head portrait generation.
server/      (future) authoritative online server reusing src/engine.
```

**Online readiness rules** (must hold for every feature):
- Battle state is plain JSON. No class instances, no functions, no Maps in state.
- All randomness comes from `state.rng` (seeded); never `Math.random()` inside the engine.
- The engine never reads the clock.
- Player input is a `Command` (`move`, `act`, `wait`, …). `applyCommand(state, cmd)` returns new
  state plus a list of `BattleEvent`s that the renderer animates. A server can validate and
  re-broadcast commands; clients replay them identically (lockstep) or receive events (authoritative).
- Content is referenced by id, so online peers only exchange ids + unit builds.

## 3. Core battle rules

### 3.1 Map
- Square grid shown isometrically; each tile has a **height** (in half-steps; 1 step = 1 "h"),
  a **terrain** type (grass, dirt, stone, sand, water, deep water, wood, snow, swamp, lava, roof, road…),
  optional **prop** (tree, rock, crate…) which can block movement and/or line of sight.
- The camera rotates in 90° steps and zooms.

### 3.2 Turn order — Clock Time (CT)
- Every tick each living, non-stopped unit gains `Speed` CT. A unit whose CT ≥ 100 takes a turn
  (ties broken by unit order/id). Haste ×1.5, Slow ×0.5, Stop/Sleep/Petrify freeze CT.
- On a turn a unit may **Move** once and **Act** once, in either order, then chooses a **facing**.
- End of turn CT: −100 if moved and acted, −80 if only one, −60 if neither (cap left at 60).
- **Charged actions** (most spells) have a charge speed `cs`: they resolve after `ceil(100/cs)` ticks
  — they appear in the turn order. Targeting a *unit* follows the unit; targeting a *tile* stays.
  Taking damage does not interrupt; Silence/Stop/Sleep/KO cancels.
- The turn-order strip shows upcoming turns and pending charged actions.

### 3.3 Stats
| Stat | Meaning |
|---|---|
| HP / MP | Health / mana. KO at 0 HP. |
| PA | Physical attack. |
| MA | Magic attack. |
| SP (Speed) | CT gain per tick. |
| Move | Tiles per move. |
| Jump | Max height difference climbed or dropped (drops of up to `Jump+2`... see 3.4). |
| C-Ev | Class evasion %. |
| Brave (0–100) | Reaction trigger chance, fist damage, some skills. |
| Faith (0–100) | Magic dealt *and* received scales with Faith. |

**Growth:** units have hidden raw stats. On level up, `raw += raw / (C + level)` where `C` is the
*current* job's growth constant for that stat — so the job you level in shapes your long-term stats.
Displayed stat = `raw × job multiplier / 100` (+ equipment).

### 3.4 Movement
- Pathfinding within `Move` tiles; a step is allowed if `|Δheight| ≤ Jump` (dropping down allows
  `Jump + 1`). Water costs 2, deep water impassable unless Float/Waterwalking. Enemies block,
  allies can be passed through but not stopped on.
- Movement abilities modify this (Move +1, Jump +1, Ignore Height, Teleport, Waterwalking, Float, Swim).

### 3.5 Facing and evasion
- Attacks from the **front** can be evaded by class, shield and accessory evasion; from the **side**
  by shield and accessory evasion (halved C-Ev); from the **back** by accessory evasion only.
- Back attacks get +50% hit chance on hit%-based skills.

### 3.6 Damage formulas (by weapon family)
| Weapon | Damage |
|---|---|
| Fists | `PA × (PA × Brave/100)` |
| Knife, Bow | `WP × (PA + SP) / 2` |
| Sword, Knightsword, Spear, Crossbow | `WP × PA` |
| Katana | `WP × PA × Brave / 100` |
| Axe, Flail | `WP × rand(1..PA)` |
| Rod | `WP × PA`, magical-element weapons can proc spells |
| Staff | `WP × MA` |
Criticals: 5% base, ×1.5 damage + knockback when possible. Elements: weak ×2, resist ×0.5, immune ×0, absorb.
Magic: `damage = MA × Q × (casterFaith/100) × (targetFaith/100)` (Faith both sides).
Charge/height modifiers: ranged weapons gain +range from height advantage.

### 3.7 Statuses
KO (3-turn countdown → **Crystal**, unit lost unless revived; casual mode disables loss), Poison,
Regen, Protect, Shell, Haste, Slow, Stop, Immobilize, Disable, Silence, Blind, Sleep, Confuse,
Charm, Berserk, Doom (countdown), Float, Reflect, Petrify, Faith/Atheist, Undead, Oil, Critical (HP ≤ 1/5),
Defending, Charging, Performing.

### 3.8 Reactions, supports, movement abilities
Each unit equips **1 Reaction, 1 Support, 1 Movement** from anything it has learned in any job.
Reactions trigger on Brave% (most) when hit.

### 3.9 Experience and JP
- EXP: per action, scaled by level difference; 100 EXP = level up.
- JP: per action in the current job; **spillover**: allies in battle gain 25% of that JP for the same job
  (even if they're not in it). JP Boost support ×1.5.
- Abilities are bought with JP in the job that teaches them. **Job level** (1–8) rises with total JP
  earned in that job, and unlocks further jobs.

### 3.10 Loadout
`Job` (primary skillset) + `Secondary skillset` (any learned skillset) + `Reaction` + `Support` + `Movement`
+ equipment: `Main hand`, `Off hand` (shield or second weapon with Dual Wield), `Head`, `Body`, `Accessory`.
What can be equipped depends on job + supports (e.g. *Equip Heavy Armour*).

### 3.11 Oaths (our signature system)
Before a battle each unit may swear one **Oath** — a battle-scoped promise with a reward and a
penalty (e.g. *Oath of the Shield: never end a turn more than 2 tiles from an ally → +20% Protect;
breaking it inflicts Doubt (−Brave)*). Kept oaths grant bonus JP/EXP. Oaths become available through
story and job mastery. Oaths are also the narrative heart of the world (see story bible).

### 3.12 Victory conditions
Defeat all, defeat a named target, protect a unit, survive N turns, reach a tile, escape.
Story battles can trigger mid-battle dialogue (turn N, unit HP threshold, unit defeated, tile reached).

## 4. Jobs (16 generic + story jobs)

| # | Job | Role | Unlock | Equips | Visual |
|---|---|---|---|---|---|
| 1 | **Squire** | balanced melee, utility | start | knife, sword, axe, flail; clothes, light armour, hats | tunic, leather cap |
| 2 | **Alchemist** | items, revives | start | knife, crossbow; clothes, hats | vest, apron |
| 3 | **Knight** | tank, equipment breaks | Squire 2 | sword, knightsword, shield; heavy armour, helms | plate |
| 4 | **Ranger** | bows, charged shots | Squire 2 | bow, crossbow; clothes, light armour, hats | hood, green cloak |
| 5 | **Cleric** | healing, protection | Alchemist 2 | staff, flail; robes, hats | white robe |
| 6 | **Wizard** | elemental damage | Alchemist 2 | rod; robes, hats | wizard hat |
| 7 | **Monk** | fists, self-heal, revive | Knight 3 | fists; clothes | sleeveless, sash |
| 8 | **Rogue** | steal, speed, evasion | Ranger 3 | knife; clothes, hats | bandana, vest |
| 9 | **Chronomancer** | haste/slow/stop, gravity | Cleric 3 | staff, rod; robes, hats | celestial hat |
| 10 | **Hexer** | status magic | Wizard 3 | rod, staff; robes, hats | dark robe, hood |
| 11 | **Lancer** | Jump | Knight 4, Rogue 2 | spear, shield; heavy armour, helms | spear, plate |
| 12 | **Warden** | terrain magic, axes | Monk 3, Ranger 3 | axe, flail; clothes, hats | horned helm, cloak |
| 13 | **Invoker** | big-area summons | Chronomancer 3, Wizard 4 | rod, staff; robes | cape, crystal rod |
| 14 | **Spellblade** | elemental sword arts | Knight 3, Wizard 3 | sword, katana, shield; light/heavy armour | rapier, cape |
| 15 | **Shadowblade** | dual wield, throwing | Rogue 4, Lancer 2, Warden 2 | knife, katana; clothes | dark garb |
| 16 | **Oathbreaker** | HP-cost dark arts | Spellblade 4, Hexer 4 (secret) | knightsword, sword; heavy armour | black plate |

Story jobs (unique to named characters): Lanternbearer, Ashguard, Inquisitor, plus monster jobs.

Each job: a primary **skillset** (6–10 abilities), 1–2 reactions, 1–3 supports, 1 movement ability.
Full ability data lives in `src/content/abilities.ts` and `src/content/jobs.ts`.

## 5. The World (free roam — "MMO meets tactics")

- One **effectively endless persistent overworld**. World tiles are battle-scale tiles (a battle is the
  ~15×15 patch of ground you stand on). Generated deterministically from a world seed per 32×32-tile
  **chunk** with 32-bit coordinates — target full world ≈30,000×30,000 tiles; only deltas are stored. The hand-authored
  story kingdom is a ~4096×4096-tile region at the centre (story docs use 0..1023 "kingdom map units",
  1 unit = 4 tiles); beyond it lies endless procedural frontier for exploration, packs and world PvP.
  Chunks are generated from elevation/moisture/temperature noise → biomes (grassland, forest, hills,
  mountains, marsh, coast, snow, badlands, Hollow-blighted lands), rivers, lakes, roads between settlements.
- **Set pieces** are hand-authored and stamped in at fixed coordinates, overriding generation:
  cities, towns, castles, abbeys, ruins, story battle sites. Story locations live in this world.
- **Free roam**: the party walks anywhere (isometric overworld, same renderer as battle). Day/night
  cycle, fog of war; explored chunks and world changes (cleared camps, looted chests, discovered
  shrines) are saved as **deltas** on top of the seed (small saves, server-friendly).
- **Encounters**: roaming enemy parties are visible on the map with aggro radii and chase/flee
  behaviour; regions have danger levels. Contact starts a battle whose **battlefield is carved from
  the local terrain** (heightmap, biome, props) around the contact point. NPC fights give a
  deployment/setup phase. Story battles use authored maps at their set-piece location.
- **World PvP (online, future)**: other players appear on the overworld; contact (when flagged for PvP
  or in contested zones) starts a battle where each side uses its **preset PvP party** (formation +
  loadouts saved in advance). Same deterministic engine, server-authoritative.
- Data model: `WorldState = { seed, chunkDeltas, discovered, entities, time }` — all JSON.

## 6. Meta-game (story mode)

- **Story**: chapters are sequences of beats tied to world locations — walk there to trigger scenes
  and battles. Story battle sites, towns and castles are set pieces in the world.
- **Party**: up to 16 roster, 5 deployed per battle (story may force some).
- **Shop**: inventory unlocks with story progress.
- **Tavern**: recruit generic units; rumours (lore).
- **Save slots** + autosave.
- **Difficulty**: Story (no perma-loss, gentler AI), Tactician (default), Oathsworn (perma-loss, smarter AI).

## 7. Monetisation guard-rails
- Cosmetic shop: dyes (palette recolours on any equipment layer), cloak/hat/visual overrides,
  portrait frames, UI themes. **Never stats.**
- Campaign packs: each is a self-contained `CampaignPack` (scenes, battles, characters, maps, items).
- Online: ranked/casual with fixed-level normalisation; cosmetics visible to opponents.

## 8. Platforms
- Responsive layout: phones (portrait shows a compact HUD; landscape preferred), tablets, desktop.
- Touch: tap to select, tap again to confirm, drag to pan, pinch to zoom, two-finger twist / button to rotate.
- Keyboard/mouse/gamepad also supported.
- Wrapping: Capacitor (iOS/Android) around the web build. No platform APIs in game code.
