# Story Jobs, Monster Jobs and Signature Items — for the engine owner

These job ids are referenced by `src/content/campaigns/main/characters.ts` and `enemies.ts` and must
exist in `src/content/jobs.ts` / `abilities.ts`. Numbers are **suggestions** in the units of
DESIGN.md (CT charge speed `cs`, MP, range in tiles, AoE radius `r`, vertical tolerance `v`); tune
freely. Flavour text is canon — please keep ability names.

Legend: **[A]** action ability (primary skillset) · **[R]** reaction · **[S]** support · **[M]** movement.
Stat multipliers are relative to Squire = 100.

---

## 1. Story jobs (human)

### 1.1 `lanternbearer` — Lanternbearer (Bren; Odo as guest)
*The old hedge-witness tradition: crossroads keepers who witnessed the promises of people who could
not pay the Ledger, and carried witnesslight against Hollows.*
- **Role:** front-line leader / support hybrid. Buffs allies' Oaths, punishes Hollows and oathbreakers,
  modest healing. The only job that can **witness** battle Oaths (see §4).
- **Equips:** sword, flail, knife; light armour, clothes, hats; shield. Signature accessory: *Brask's
  Lantern* (§3).
- **Stats:** HP 110, MP 90, PA 105, MA 95, SP 100, Move 4, Jump 3, C-Ev 10.
- **Unlock:** story only (Bren from c1.s13). Odo has it at L6 as a guest.
- **Abilities [A] — skillset "Witness":**
  1. **Lantern Ward** — raise the lantern; Hollow-type enemies within r2 cannot end their move
     adjacent to the caster until its next turn. Instant, MP 6. *"Stay back. I've got light."*
  2. **I Witness You** — target ally: +10 Brave and **Surety** status for 3 turns (an ally keeping a
     battle Oath gains double Oath bonus while Surety lasts). Range 3, instant, MP 8.
  3. **Witnesslight** — holy damage, cs 25, range 4, r1; ×2 vs Hollow/undead, ignores Faith on
     Hollows. MP 12. *A clean white flare that smells of candle-smoke.*
  4. **Name the Forfeit** — target enemy marked **Forsworn** for 3 turns: next time it uses an ability
     it takes 20% max HP damage. Range 3, cs 34, MP 10, hit% = 50 + (caster Faith − target Faith)/2.
  5. **Steady Hands** — target ally: remove Doubt, Confuse, Fear/Charm; small heal (MA×2). Range 3,
     instant, MP 10.
  6. **Crossroads Rally** — all allies within r2: +1 Move, +5 Brave for their next turn. Instant,
     MP 16, once per battle.
  7. **Settle the Debt** — strike a Hollow or Restless with the lantern: weapon damage ×1.5; if it
     kills, nearby (r1) Hollows take holy damage MA×2. PA-based, instant, MP 8.
  8. **Keep the Light** *(learned late, C2+)* — party-wide: battle Oaths cannot be broken by
     KO/status for 2 turns. MP 30, cs 20.
- **[R] Witness's Eye** — when an adjacent ally is attacked, Brave% chance to grant them Protect.
- **[S] Oathkeeper** — Oaths sworn by this unit give +50% reward; penalties for breaking are halved.
- **[S] Lamp-Lit** — immune to Blind and Fear; Hollows take +25% damage from this unit.
- **[M] Fen-Walker** — ignores swamp/shallow-water movement cost.

### 1.2 `ashguard` — Ashguard (Ilka Stroud; Ashguard sergeants/torchbearers)
*The Regent's grey cloaks, founded to burn Hollow-blighted villages. Fire, discipline, terror.*
- **Role:** heavy fire-melee, area denial, anti-undead. Sets terrain alight.
- **Equips:** axe, knightsword, spear; heavy armour, helms; shield.
- **Stats:** HP 125, MP 60, PA 115, MA 90, SP 95, Move 4, Jump 3, C-Ev 5.
- **Abilities [A] — "Ashing":**
  1. **Torch-Cut** — weapon damage + Fire element; 30% chance to inflict Oil→burn. Instant, MP 0.
  2. **Ash the Ground** — target tile r1 becomes *burning* for 3 turns (units ending turn there take
     10% max HP fire damage; Hollows 20%). Range 3, cs 34, MP 10.
  3. **Ash and Order** — allies in r2: +10 Brave, immune to Fear for 3 turns. Instant, MP 12.
  4. **Firebreak** — line of 3 tiles in front becomes burning; pushes units back 1. MP 14, cs 25.
  5. **Grey Cloak** — self: Shell + Fire resist for 3 turns. Instant, MP 8.
  6. **Pyre** — target a KO'd enemy: removes it (instant crystal) and heals caster 20% HP; vs Restless
     at ≤ 20% HP: instant destroy. MP 16. *"Ash today. Harvest tomorrow."*
  7. **Hold the Line** — until next turn, enemies cannot move past tiles adjacent to the caster (zone of
     control). Instant, MP 10.
- **[R] Smoulder** — when hit by melee, Brave% chance the attacker gains Oil.
- **[S] Ashborn** — absorb Fire.
- **[M] Burn-Walker** — immune to burning-tile damage; Move +1 on burning tiles.

### 1.3 `inquisitor` — Auditor (display name: **Auditor**; DESIGN calls it "Inquisitor")
*The Ledger's inquisition. Grey gloves, warrants, ink that binds. They read oaths, seal mouths and —
with the Archscribe's seal — strike.*
- **Role:** anti-caster, debuffer, oath-punisher. Spells use Faith; "Seal" abilities hit harder on units
  that are under a battle Oath.
- **Equips:** staff, book (treat as rod), knife; robes, clothes, hats.
- **Stats:** HP 95, MP 120, PA 85, MA 115, SP 105, Move 3, Jump 3, C-Ev 10.
- **Abilities [A] — "Audit":**
  1. **Read the Oath** — reveal target's Oath, Brave/Faith, reaction; target cannot benefit from its Oath
     this turn. Range 4, instant, MP 4.
  2. **Seal** — Silence + Disable (1 turn). Range 4, cs 25, MP 12. *"Your words are noted. And withheld."*
  3. **Lien** — drain MP (MA×2) from target. Range 4, cs 34, MP 0.
  4. **Debit** — dark damage MA×Q(14); ×1.5 vs units under an Oath. Range 4, r0, cs 25, MP 14.
  5. **Inkbind** — Immobilize + Slow on a 3-tile cross. Range 4, cs 20, MP 18.
  6. **Breach of Contract** — target's active Oath is immediately **broken** (owner suffers the
     penalty); summons a **Hollow shade** adjacent to the target at the caster's level −2. Range 3,
     cs 17, MP 24. Bosses only in Chapter 1 (Morrow, Crane). *The pen moves. The air goes cold.*
  7. **Remission** — ally: heal MA×Q(12), remove Doubt. Range 4, cs 34, MP 10.
  8. **Strike** *(Archscribe warrant; boss-only scripted ability, Morrow B7 only)* — target loses all
     buffs and 25% current HP; if the target is a Hollow, it is destroyed. Range 5, cs 15, MP 30.
- **[R] Countersign** — when targeted by a spell, Brave% chance to reflect half its damage.
- **[S] Warrant** — +20% hit% on status abilities vs units under an Oath.
- **[M] Procession** — Move +1 when starting the turn adjacent to an ally.

### 1.4 `archscribe` — Archscribe (Clement; final boss of the saga — not needed for Chapter 1 combat)
*The head of the Ledger. Everything the Auditors can do, written larger.*
- **Abilities (concept):** **Annotate** (rewrite a unit's job/abilities for 2 turns), **Strike Through**
  (line AoE: removes buffs/Oaths, damages), **Black Folio** (summons Gaunts from struck debts),
  **The Book Remembers** (revive allies), **Remit** (transfer all debuffs from Clement to the lowest-Faith
  player unit), **Final Audit** (map-wide, charged 3 turns; damage scales with total Oaths broken this
  battle). **[R]** Erratum (undo the last damage taken, once per battle). Immune to Doom/Stop/Charm.

### 1.5 `sovereign` — Sovereign (Hesper from Chapter 3; listed for planning only)
*Queen Aurelie fights with her voice, her Naming and the promises of a realm.*
- **Concepts:** **Royal Decree** (party-wide buff), **Crown's Grace** (big heal), **Pardon** (remove KO
  countdown/crystal timer), **Edict** (zone where enemies can't use a chosen ability type), **Lark's Song**
  (sleep AoE, lullaby), **Name Them** (grant an unrecorded ally +Faith and immunity to Remittance effects).
  Not needed for Chapter 1.

---

## 2. Monster jobs

All monster appearances use the LPC parts listed in enemies.ts. All monsters except `lizardfolk` are
**Hollows** in the fiction and carry the **Hollow** trait: weak to Holy (×2), immune to Poison/Doom,
take damage from *witnesslight*, cannot be charmed by human abilities, and **Ignore Faith** on
received magic except Holy. `skeleton`/`ghoul` also carry **Undead** (healing hurts them).

| Job id | Fiction name | Role | Move/Jump | Abilities (6–8) | R / S / M |
|---|---|---|---|---|---|
| `wolfkin` | Hollow hound / wolfkin | fast melee skirmisher | 5 / 3 | **Rend** (PA×1.2, bleed=poison 2 turns) · **Pack Howl** (allied Hollows r3 +1 SP for 2 turns) · **Hamstring** (Slow) · **Lunge** (attack 2 tiles away in a line, moves adjacent) · **Scent of Debt** (bonus +25% damage vs units with an Oath broken this battle) · **Fade** (become untargetable by ranged until next turn; can't act next turn) | R: Counter (Brave%) · S: Night Hunter (+20% PA in dusk/night maps) · M: Move +1 |
| `hollow` | Hollow shade | spectral harasser, debuffer | 4 / 4 | **Cold Touch** (MA×Q8 dark + Slow) · **Whisper of Doubt** (−10 Brave, range 3) · **Drift** (Float; passes over water/void) · **Hunger** (drain HP MA×Q6) · **Unmake** (if target is under an Oath, 30% chance to break it) · **Gather** (heal 25% when adjacent to another shade) | R: Phase (25% to evade physical) · S: Incorporeal (half physical damage) · M: Float (always) |
| `skeleton` | Restless (bones) | durable melee, ranged variant with bows | 3 / 3 | **Rusted Blade** · **Bone Wall** (Defending + Protect self) · **Rattle** (Fear on adjacent, 25%) · **Grave Arrow** (archer variant, range 5) · **Reassemble** (once: revive at 30% HP after 2 turns unless the corpse is hit by Holy or Pyre) · **Old Oath** (if its boss is alive, +10 PA) | R: Counter · S: Undead · M: — |
| `ghoul` | Restless (flesh) | grappler, poison | 3 / 2 | **Claw** (poison 30%) · **Gnaw** (drain HP) · **Grasp** (Immobilize 2 turns, adjacent) · **Stench** (r1 Blind 25%) · **Feast** (on a KO'd unit: heal 40% and remove it) · **Shamble** (moves through swamp at full speed) | R: Hold Fast (Brave%: Immobilize attacker) · S: Undead · M: Swamp Walk |
| `goblin` | Titheling | thief, pest | 4 / 4 | **Pilfer** (steal consumable item) · **Snatch Coin** (steal gil) · **Pinch** (knife, low damage, Slow 20%) · **Scatter** (moves 3 after acting) · **Hoard Glint** (Charm 20%, range 2) · **Tithe-Bite** (damage ×1.5 vs units carrying the most gil—flavour) | R: Dodge (+30% evade, Brave%) · S: Light Fingers · M: Jump +2 |
| `gaunt` | Gaunt | elite caster-drainer (later chapters) | 4 / 3 | **Drink Grace** (drain MP+HP) · **Noble Mien** (Charm) · **Hollow Court** (summon 2 shades) · **Bloodless** (regen in night) · **Contempt** (Doubt AoE r2) · **Mist Form** (teleport 4) | R: Absorb Grace (MP restore when hit by spells) · S: Hollow · M: Teleport |
| `brute` | Hollow brute (orc-headed) | heavy melee | 3 / 2 | **Smash** (PA×1.5, knockback) · **Roar** (Fear r2) · **Gore Charge** (line 3) · **Thick Hide** (Protect self) · **Rage** (Berserk self, +50% PA) · **Toss** (throw adjacent unit 2 tiles) | R: Counter · S: Heavy Body (no knockback) · M: — |
| `boarman` | Hollow boarman | charger | 4 / 2 | **Tusk Charge** (move-attack line, knockback) · **Trample** · **Wallow** (heal in swamp/mud) · **Snort** (Disable 1 turn) · **Root Out** (reveal hidden units r3) · **Bristle** (counter-damage on melee) | R: Bristle · S: Swamp Hide · M: Move +1 on dirt/swamp |
| `minotaur` | the Horned Debt | mini-boss bruiser | 4 / 3 | **Horn Rush** (charge 4, knockback 2) · **Labrys Sweep** (all adjacent) · **Bellow** (Stop 1 turn, r1, 25%) · **Stamp** (tile r1 damage) · **Debt Collector** (+PA per Oath broken by player this battle) · **Unbowed** (immune to Fear/Charm/Confuse) | R: Counter Strike · S: Giant (cannot be pushed) · M: Ignore Height (≤4) |
| `troll` | Barrow troll | rare slow tank / mini-boss | 3 / 2 | **Club** · **Boulder Toss** (range 4, r1) · **Regenerate** (Regen self) · **Stone Skin** (Protect+Shell, Slow self) · **Ground Slam** (r1, Immobilize 30%) · **Sunken** (weak to Holy ×2, Fire ×1.5) | R: Counter · S: Regenerator · M: — |
| `lizardfolk` | Sarth (a living people — **not** Hollows) | spear skirmisher, marsh specialist | 4 / 3 | **Reed Spear** (range 2 thrust) · **Tail Sweep** (adjacent, knockback) · **Mire Spit** (Blind + Slow, range 3) · **Submerge** (in water: untargetable 1 turn) · **Oathcarving** (oathcarver variant: ally Protect + Regen) · **Hiss** (−Brave r2) | R: Counter · S: Swimmer (deep water passable) · M: Waterwalk |

---

## 3. Signature items (please create)

| Id | Name | Slot | Effect | Owner / where |
|---|---|---|---|---|
| `brask_lantern` | Brask's Lantern | accessory | Holy-element resist; auto-**Lantern Ward** at battle start (2 turns); +10 Faith; Hollows' Fear immunity removed vs wearer. Visual: lantern held in off-hand idle. | Odo (B1–B4), then Bren (c1.s13 onward) |
| `half_penny` | Half a Penny | accessory | +5 Brave, +5 Faith; when the other half's bearer is in the same battle, both gain +10% evade and Regen while adjacent. *"A fair half."* | Bren and Hesper (start) |
| `auditor_warrant` | Archscribe's Warrant | (key item, not equippable) | Story-only. Morrow's sealed warrant; enables his `Strike`. | Morrow; looted after B7 as a key item |
| `millbrook_register` | The Millbrook Register | key item | Story-only. | Box contents; taken by the Regent |

---

## 4. Battle Oaths — Chapter 1 set (fiction-locked until flag `oaths_unlocked`)

Suggested starter Oaths available after c1.s16 (DESIGN §3.11), each sworn before Bren's lantern.
Rewards/penalties are examples; tune to the engine's Oath system.

| Id | Oath | Condition | Reward | Forfeit if broken |
|---|---|---|---|---|
| `oath_shield` | Oath of the Shield | Never end a turn more than 2 tiles from an ally. | +20% Protect chance at turn start; +JP | Doubt (−10 Brave) |
| `oath_first_light` | Oath of First Light | Act before any enemy acts on your first turn (deploy forward). | +1 Move for battle | Doubt |
| `oath_no_retreat` | Oath of the Ford | Never move to a tile farther from the nearest enemy than where you started the turn. | +15% PA | Doubt + Slow 1 turn |
| `oath_mercy` | Oath of Mercy | Never strike a unit at Critical HP that isn't a Hollow. | +20 Faith, +EXP | Doubt |
| `oath_witness` | Oath of the Witness *(Bren only)* | Keep every ally within 4 tiles in line of sight at end of each turn. | Allies' Oath rewards +25% | Doubt for Bren |
| `oath_last_stand` | Oath of the Lantern *(unlocked c1.s13, Odo's memory)* | Do not fall while any ally stands. | Auto-Regen at Critical | Doubt; party −5 Brave |
