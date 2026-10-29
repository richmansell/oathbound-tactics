# Chapter 1 — *The Split Penny*

> Region: the Lowmarch and the Greyfen (see BIBLE §6, §6A). Season: late autumn, 634 AL.
> Playable demo. 7 story battles (B1–B7), 3 repeatable skirmishes, 24 story scenes, ~35 mid-battle
> trigger scenes. Data: `src/content/campaigns/main/chapter1/`. Maps: `src/content/campaigns/main/maps.ts`.

## 0. Shape of the chapter

| Act | Scenes | Battles | Purpose |
|---|---|---|---|
| **Prologue** | s01 | — | Cold open: the Night of the Striking. Hook + seed the heir mystery. |
| **I. The Lantern Road** | s02–s11 | B1–B3 | Meet Bren and his company; reunion with Hesper; the contract; the box; the Regent wants it. |
| **Turn** | s12–s13 | B4 | Morrow betrays the company; Odo dies; Bren takes the lantern. |
| **II. The Greyfen** | s14–s18 | B5–B6 | Fugitives. Gather Aldous, Eira, Jory. Hedge oaths are real — the Oathbound are born (**Oath system unlock**). Jory's betrayal. |
| **III. The Split Penny** | s19–s24 | B7 | Assault on Hollin Tor; Hesper reads her name; the Regent kneels; Hesper leaves with him. Sting. |

**Emotional spine:** Bren and Hesper rediscover each other (s04–s06), are forced together as
fugitives (s13–s19), and are split by the truth (s21–s23) — with Bren *witnessing* the oath that
takes her away.

**Gameplay spine:** tutorial (B1) → first human enemies and a boss who yields (B2) → defence and
chokepoints (B3) → escape objective with an ally holding the line (B4) → undead and terrain (B5) →
first battle with Oaths, night defence on stilts (B6) → climb-and-assault boss fight (B7).

### Party flow
| When | Joins / leaves |
|---|---|
| Start | **Bren** (Squire, L1), **Odo** (Lanternbearer, L6, guest), **Wat** (Squire, L2), **Merrit** (Ranger, L2) |
| after s03 | **Tamsin** joins (Ranger) |
| after s04 | **Hesper** joins (Cleric, story-required until s22) |
| after s12 | Wat and Merrit leave (killed in the camp attack) |
| after s13 | Odo leaves (dies). Bren unlocks **Lanternbearer** |
| after s15 | **Aldous** joins (Knight) |
| after s16 | **Oath system unlocks** (flag `oaths_unlocked`) |
| after s18 | **Eira** joins (Wizard), **Jory** joins (Rogue) |
| after s22 | Hesper leaves (with the Regent) |
Generic recruits are available at the Drowned Lantern (Tallow Cross) from s04.

### Levels
B1 enemies L1 · B2 L2–3 · B3 L3–5 · B4 L4–5 · B5 L5–6 · B6 L6–7 · B7 L7–9. Skirmishes scale to party.

### VO id ranges
Story scenes `main.c1.s01`–`s24`. Battle trigger scenes: B1 `s40–s44`, B2 `s45–s49`, B3 `s50–s55`,
B4 `s56–s62`, B5 `s63–s67`, B6 `s68–s74`, B7 `s75–s82`, skirmishes `s85–s89`.
Unused numbers inside a range are reserved (e.g. s44, s61, s67) — never reuse them for other content.
Full voice script (generated from the data, with directions and line counts): `chapter1_vo_script.md`.

---

## Prologue

### s01 — The Night of the Striking *(Aurenne, 622 AL — 12 years ago)*
- **Location:** `aurenne_palace` (map-less; black → castle-hall backdrop). Music: `cold_open`.
- **Beats:**
  1. Black screen. Narration: in Aldmere every promise is written; every broken one comes back hungry.
  2. A candlelit scriptorium. A soft old voice ("???" — Clement) reads King Edric's Crown Oath aloud
     from a great book. A young scribe (hooded — Morrow, credited "Hooded Scribe") holds the lamp.
     The voice: "Struck." A pen-stroke sound. Thunder.
  3. The royal bedchamber: King Edric convulses, ash spilling from his lips; he gasps a name: "Lark—"
  4. Rain on a road outside the city. Nurse Maud drags a ten-year-old girl through mud. Howls behind
     them. "Don't look back, little lark." Hollows. Maud pushes the girl into a ditch, turns to face
     them. The girl runs into the dark.
  5. The hooded scribe, on the road, lantern raised, finds Maud's body. "Find her." Cut to black.
- **Purpose:** hook; establish Striking as a terrible, unexplained act; seed "lark".
- **After:** title card *Oathbound Tactics* / *Chapter One — The Split Penny*.

---

## Act I — The Lantern Road

### s02 — Brask's Lanterns *(the Lantern Road, Greyfen; dusk)*
- Staged on `map_lantern_road`. Twelve years later. Brask's Lanterns escort Brother Anselm's tithe
  wagon to Tallow Cross. Odo jokes; Bren is dry; Wat eats; Merrit mocks. Anselm frets about the
  dark lanterns on the road. Bren mocks hedge-witch superstition and Odo, oddly, doesn't laugh.
- Odo mentions a bigger contract waiting at Tallow Cross — "Ledger money. Real Ledger money."
- A scream from the fen. A girl (Tamsin) on a hummock, shooting at shapes in the reeds: Hollow hounds.
  Odo: "Lanterns! Light up!" → **B1**.

### B1 — Lanterns in the Fen *(tutorial)*
- **Map:** `map_lantern_road` (12×14, dusk). A raised dirt causeway (h2) runs north–south through fen;
  shallow water and swamp either side, deep pools, reed hummocks (h1–3), dead trees, lantern posts
  along the road, a collapsed stone waystation (h3–4) in the north-east, the tithe wagon on the road.
- **Objective:** defeat all. **Deploy:** Bren + Odo required, up to 4 (Wat, Merrit). South causeway.
- **Enemies:** 5 Hollow hounds (L1) — 2 from the north on the road, 3 from the fens (east, west).
  **Ally:** Tamsin (guest, AI) on the western hummock.
- **Why it matters:** introduces the company as a family and Hollows as a real, nasty threat;
  Tamsin's skill; Odo's lantern (he is visibly better at fighting Hollows than he should be).
- **Triggers:** `start` s40 (Odo teaches move/attack/height; Bren's dry replies) · `turn 2` s41
  (Tamsin: "Oi! Lanterns! Left side, they're flanking!") · `Odo hp<50` s42 (Odo: "Just a scratch,
  lad. Mostly ribs.") · `enemiesLeft 1` s43 (Anselm cowering in the wagon).

### s03 — The Poacher *(the Lantern Road; night)*
- Staged on `map_lantern_road`. Tamsin is prickly; refuses thanks; stole one of Anselm's tithe hens.
  Anselm, shaking, explains Hollows in Canon terms ("a broken oath's debt, made manifest"). Tamsin:
  "My village never swore anything. Couldn't afford the ink." — **Remittance seed**. The hounds came
  from Sallowmere, ashed by the Ashguard two years ago. Tamsin has heard an Ashguard company is
  riding toward Tallow Cross. She'll walk with the Lanterns as far as town. Odo offers her pay to
  stay longer. "I'm not a sellsword." "Nor's Bren, most days." **Tamsin joins.**

### s04 — The Drowned Lantern *(Tallow Cross, the inn; evening)*
- Map-less (`drowned_lantern`, tavern backdrop). The client: **High Auditor Ignace Morrow**, grey
  gloves, half-moon spectacles — and his novice. **Hesper.** Bren hasn't seen her in eight years.
  The reunion: shock, awkwardness, a joke that lands, a joke that doesn't. Tamsin: "Who's the candle?"
- The contract: escort a sealed reliquary from Millbrook's foundling house to the Archive at
  Aurenne, with the novice. Morrow insists on the fen road. Fee: forty crowns. Odo's eyebrows.
- The contract is sworn through Oathcraft. **Hesper is the Witness** (her first). "Name?" Bren: "Bren
  Holloway." Morrow: "You are not in the Ledger." Odo signs for the company. "Witnessed, and kept."
- **Unlocks:** Tallow Cross shop and tavern (recruits). **Hesper joins.**

### s05 — Two Halves *(the inn's roof; night)*
- Map-less (`tallow_cross_roof`). Bren climbs out to the leaded roof. Hesper is already there ("You
  still climb out of windows." "You're on the roof too." "I used the stairs. Like a person.").
- Catch-up: her Ledger life, his roads. Friction: he's seen Notaries take hearth-pennies from widows;
  she believes the Ledger can be better and *she* will make it so.
- Seeds: her novice vows "wouldn't take" — the ink wouldn't hold — Morrow said it was a smudge;
  she hums a lullaby about a lark and doesn't know where she learned it.
- Each produces their half of the penny. Neither has let go. → **s06**.

### s06 — Ten Years Ago *(flashback; foundling house roof, Millbrook, 624 AL)*
- Map-less (`millbrook_roof_memory`), young portraits. Young Hesper has just been told orphans can't
  have oaths witnessed — no Naming, no money. Young Bren: "Then we'll do it ourselves." He cuts a
  penny with a kitchen knife (badly). The oath: *"Whatever they write about us, we keep each other's
  truth. I'll be your witness. You'll be mine."* "I witness you." "And I you." A lamp on the sill
  seems to burn steadier for a moment (witnesslight — unnoticed).
- Back to the present for two closing lines: "You still can't cut straight." "It's a fair half."

### s07 — Miller's Cut *(the King's Road south; day)*
- Staged on `map_millers_cut`. Morrow has ridden ahead to Millbrook. The company enters the sunken
  lane. Odo dislikes it ("Ground's built for ambushes. If I were a bandit I'd… ah."). Jory Tenpenny
  appears on the mill gantry, all charm: the Ledger cart, please. He believes it carries debt-rolls.
- **B2**.

### B2 — The Tenpenny Toll
- **Map:** `map_millers_cut` (13×14, day). Sunken lane (h1) running south → north-east between wooded
  banks (h4–6, trees, bushes) with earthen steps up; abandoned watermill (wood floor h5, roof h8) and
  millrace (deep water + a plank bridge) in the north-east.
- **Objective:** defeat **Jory** (he yields). **Deploy:** Bren, Hesper, Odo required; up to 5.
- **Enemies:** Jory (Rogue L3, boss-yield), 2 Struck brigands (squire), 2 Struck poachers (ranger,
  on the banks), 1 Struck cutpurse (rogue). L2.
- **Why it matters:** first human enemies — and they're poor, hungry and not evil. Moral discomfort.
  Hesper's first battle; she's appalled and good at it.
- **Triggers:** `start` s45 (Jory's toll speech; Hesper quotes Canon at him) · `turn 3` s46 (Struck
  brigand: "We don't want to kill you! We want the cart!") · `Hesper hp<60` s47 (Bren covers her) ·
  `Jory hp<40` s48 (Jory: "Right! Yielding! I'm yielding, that's me yielding!").

### s08 — The Struck *(Miller's Cut; afternoon)*
- Staged on `map_millers_cut`. Jory, tied, talks: Tenpenny has Hollows every winter and no one there
  ever broke an oath. "Notary says we owe for a lord's sin. Didn't say which lord." Hesper is
  unsettled. Morrow returns with Vergers; he wants Jory hanged from the mill.
- **Choice (Bren):** "He's ours. Our prisoner, our say." (`c1_jory_defended`) / say nothing
  (`c1_jory_silent`). Either way Hesper begs mercy; Morrow relents "for the novice's sake" and orders
  Jory taken to the Tallow Cross notary. By morning Jory is gone — Tamsin cut him loose ("He's fen.").
  Morrow, unconcerned: "It is noted." (He has just acquired an informer.)

### s09 — Saint Verity's Charity *(Millbrook; dusk)*
- Staged on `map_millbrook`. Home. The foundling house is smaller than Bren remembers. Mother Agathe,
  old and frightened, embraces Hesper — "Forgive me, child" — and gives Morrow the reliquary (black
  wood, iron bands, Ledger seals). Bren asks to see his own intake entry, for curiosity. "There's no
  entry for you, Bren. There never was." Agathe never paid his Naming. "You were a good boy. It
  didn't seem to matter."
- Horns. Grey cloaks in the lane: **Captain Ilka Stroud** of the Ashguard demands "the Millbrook
  register, by order of the Lord Regent." Morrow refuses in the Witness's name. Tamsin sees Ilka and
  goes white. → **B3**.

### B3 — Ashes at Millbrook
- **Map:** `map_millbrook` (14×14, dusk). The walled compound: high stone walls (h8), a south gate,
  a cobbled courtyard (h1), the dormitory (floor h1, a stair up to the flat roof-walk h7), the chapel
  and bell-cote (h10), a laundry yard; a rubble breach in the east wall (h3). Outside: the village
  lane, a brook, cottage roofs.
- **Objective:** defeat **Ilka** (she withdraws). **Deploy:** Bren, Hesper required; up to 5. Courtyard.
- **Enemies:** Ilka (Ashguard L5, boss), 2 Ashguard soldiers (knight), 2 Ashguard archers (ranger),
  1 Ashguard torchbearer (ashguard — fire), 1 Ashguard lancer (L4, arrives turn 3 at the breach). L3–4.
- **Why it matters:** the Regent's soldiers look like the villains. Tamsin meets her nemesis. Ilka
  sees Hesper's face — and hesitates. Defending their childhood home.
- **Triggers:** `start` s50 (Ilka's ultimatum; Odo's reply) · `turn 2` s51 (Tamsin recognises Ilka:
  "YOU.") · `turn 3` s52 + reveal lancer at the breach · `Ilka hp<60` s53 (Ilka sees Hesper: "…That
  face.") · `victory` s54 (Ilka withdraws: "This isn't finished. Ash and order.") · `Hesper hp<40` s55.

### s10 — The Lantern's Story *(Millbrook, the chapel; night)*
- Map-less (`millbrook_chapel`). Odo and Bren alone. Odo is uneasy: the Regent's own Ashguard for a
  box of papers? Bren asks about the lantern, which Odo never lets out of reach. Odo tells a story
  of an old woman at a crossroads chapel who "witnessed promises for folk who couldn't pay". He
  doesn't say he was her apprentice. "Every promise needs a witness, lad. Even the cheap ones."
  Morrow orders departure before dawn — by the fen road and the Sallow Ford, to avoid the Ashguard.

### s11 — The Captain's Letter *(Ashguard camp outside Millbrook; night — cutaway)*
- Map-less (`camp_ashguard`). Ilka, bandaging a cut, dictates a report to a sergeant: the Ledger has
  the box; she failed. Then, alone, unfolds a letter sealed with the Regent's mark. Grey ash comes away
  on her glove. She looks at it a long time. "She has her mother's face, my lord." She burns the letter.

---

## The Turn

### s12 — What's in the Box *(camp on the south bank of the Sallow Ford; night)*
- Staged on `map_sallow_ford`. Odo, unable to sleep, pries the reliquary open with Bren's knife and
  reads by lantern-light. "Ink and ashes." He looks at Hesper, asleep by the fire. Before he can wake
  Bren, Morrow is there. "You have read what is written. That is a breach of contract."
- Morrow produces a warrant with the Archscribe's seal and **strikes** the Lanterns' contract. The
  air goes cold. The contract's debt erupts as Hollows among the tents; Wat and Merrit fall in the
  dark. Auditors step out of the reeds. Hesper wakes: "Brother Morrow — what are you doing?" Morrow:
  "Keeping you, child." Odo: "Bren. Take the girl and run. She's—" (a Hollow hits him). → **B4**.

### B4 — The Sallow Ford *(escape)*
- **Map:** `map_sallow_ford` (12×16, night). The Sallow (deep water) crosses the map east–west; a
  zig-zag stone causeway-ford (h1) on the west-centre; the stub of a broken bridge (h4) in the east;
  a reed-island shallow crossing (cost 2) further west. The camp on the south bank; the north bank
  rises to a hedge-lined lane and the escape tiles at the north edge.
- **Objective:** **escape** — Bren must reach the north edge (any party unit may escape; Bren and
  Hesper both must, or the battle is lost). **Defeat:** Bren or Hesper KO'd and crystallised.
- **Deploy:** Bren, Hesper required; up to 5 (Tamsin + recruits). South bank by the camp.
- **Ally:** **Odo** (guest AI, `guard`) holds the causeway's south end.
- **Enemies:** 3 Hollows (shade) from the burning tents, 2 Auditor acolytes (inquisitor) and 1 Ledger
  Verger (knight) from the east reeds, 1 Ledger censor (hexer) on the broken bridge. Morrow present at
  the south-east, unattackable at the back (`hidden: false`, `ai: guard`, does not advance). L4–5.
- **Triggers:** `start` s56 (Odo: "I'll hold the ford. Go!") · `turn 2` s57 (Hesper and Morrow
  shouting across the water) · `turn 4` s58 (Odo wounded: "Don't look back, lad!") · `Odo hp<30`
  s59 · Bren reaches the far bank (`tileReached` rows 4–5) s60 ("Captain! Come on!" "In a moment, lad.") ·
  `Hesper hp<40` s62.

### s13 — The Lantern Passes *(north bank; before dawn)*
- Map-less (`sallow_ford_north`). Odo staggers across the ford after them, a Hollow's grey wound in
  his side spreading like frost. He sits against a fence. The Hollows won't come near the lantern.
- He gives Bren the lantern. "Every promise needs a witness, lad. Be one." To Hesper: "Whatever's in
  that box — it's not your fault, girl. Remember that." He tries to say what he read; can't; laughs
  at himself instead. Dies with the lantern still burning.
- Bren's quiet grief. Hesper's denial: "The Ledger doesn't do this." Bren: "It just did." Tamsin, on
  watch, says the only kind thing she says all chapter.
- **Bren gains the Lanternbearer job.**

---

## Act II — The Greyfen

### s14 — Fugitives *(the Greyfen; morning)*
- Map-less (`greyfen_deep`). Tamsin leads them into the fen. Jory Tenpenny turns up on a punt —
  "I owe you one, friend. Two, if we count the rope." — and is vague about how he slipped the
  Auditors (**informer seed**). He offers Tenpenny as a hiding place. On the way: bells from a
  drowned churchyard where no bell has rung in eighty years — and shouting. → staged entry to **B5**.

### B5 — The Drowned Churchyard
- **Map:** `map_saint_odile` (13×13, overcast fog). A half-sunk chapel (tilted stone floor h2–4,
  broken pillars), a bell-tower stump (h8), tombstones on hummocks in swamp and shallow water, yews.
- **Objective:** defeat all. **Deploy:** Bren, Hesper required; up to 5 (Jory not yet playable). SW.
- **Ally:** **Ser Aldous** (guest AI) on the chapel steps, already fighting.
- **Enemies:** **The Sexton** (named Restless ghoul boss, L6), 3 Restless skeletons, 2 ghouls, 1
  Hollow shade. L5.
- **Why it matters:** the uncanny; the old debts of the dead; Aldous's introduction and his Grey Dog.
- **Triggers:** `start` s63 (Aldous: "Good evening. Do mind the dead.") · `turn 3` s64 (the Grey Dog
  seen on the far hummock; Tamsin: "Is that… yours?" Aldous: "In a manner of speaking.") ·
  `Sexton hp<50` s65 (the Sexton rings the bell; Restless reveal) · `Aldous hp<40` s66.

### s15 — The Knight and His Companion *(Saint Odile's; dusk)*
- Staged on `map_saint_odile`. Ser Aldous Pell introduces himself with absurd courtesy. The Grey Dog
  watches from the reeds. He is an oathbreaker; it is his debt; it is patient. Tamsin wants to know
  what oath. "One I was not equal to." He looks at Hesper too long: "Forgive me. Have we met, my
  lady?" Hesper: "I'm a novice of the Ledger, ser. I meet a great many people." He offers his sword
  as far as Tenpenny. "I am going that way." "You don't know where we're going." "I am always going
  that way." **Aldous joins.**

### s16 — Tenpenny *(Tenpenny; evening)*
- Staged on `map_tenpenny`. The Struck village on stilts. Pim (8) adopts Bren instantly. Hollow tally-
  marks on every door. **Eira Ashmantle**, the northern scholar, has lived here a season studying the
  Hollows; she's blunt, curious and delighted by Odo's lantern ("That is a Lanternbearer's lamp. Where
  did you get it?").
- **The revelation:** Eira notices Bren's and Hesper's half-pennies, touches one, and stops. "You are
  bound. Who witnessed it?" "Nobody. We were children." "Then you witnessed each other. That is
  enough. That has always been enough." Hesper: "A word unwitnessed is wind." Eira: "Your Canon says
  so. Your Canon also charges two marks a baby." Tamsin goes quiet — she swore something to Col.
- Bren thinks of Odo; lights the lantern; asks if they'll swear — to each other, no Ledger: to stand
  together, to keep each other's truth, each naming a forfeit. One by one they do, Bren witnessing.
  Hesper last, hesitating, then: "…I witness you." The lantern burns white. **The Oathbound.**
- **Oath system unlocked** (`oaths_unlocked`). Tutorial pop-up recommended.

### s17 — Night Falls on Tenpenny *(Tenpenny; night)*
- Staged on `map_tenpenny`. Lights on the causeway: Auditors, led by **Brother Absalom Crane**, with
  Hollow-shades drifting in the water behind them. Crane: "By warrant of the Archive. The novice
  comes with us. The rest are struck." Jory goes pale. → **B6**.

### B6 — The Night of Tenpenny *(first battle with Oaths)*
- **Map:** `map_tenpenny` (14×14, night). Stilt-houses (roofs h7) and plank walkways (h3–4) over swamp
  and water; a central stilt-hall platform; eel-weirs; the hedge-lantern shrine; a causeway entering
  from the north.
- **Objective:** defeat **Crane**. **Deploy:** Bren, Hesper required; up to 5 (Aldous, Tamsin…).
- **Allies:** **Eira** (guest, wizard) and **Jory** (guest, rogue).
- **Enemies:** Crane (Auditor L7, boss), 2 Auditor acolytes, 1 Verger, 1 Ledger censor, 3 Hollow shades
  from the water (2 revealed turn 3). L6.
- **Why it matters:** Oaths in play; defending the powerless; Jory's betrayal exposed mid-battle.
- **Triggers:** `start` s68 · `turn 2` s69 (Crane: "Thank your thatcher for the directions." Jory:
  "That's — he's lying —") · `turn 3` s70 + reveal 2 shades · `Crane hp<50` s71 ("The book
  remembers!") · `Eira hp<40` s72 · `victory` s73 · `Jory hp<30` s74.

### s18 — The Price of a Line *(Tenpenny, the stilt-hall; night)*
- Map-less (`tenpenny_hall`). Jory confesses: the Auditors caught him after Miller's Cut; Pim's hearth-
  debt struck if he told them where the fugitives went. They came anyway. "I sold you for a line of
  ink. That's what I'm worth. That's what they taught me I'm worth."
- **Choice (Bren):** "You'll walk in front from now on." (`c1_jory_forgiven`) / "Get out of my sight."
  (`c1_jory_shamed`) — in the second path Pim takes Bren's hand and Jory follows anyway; Bren lets him.
  **Jory joins** either way.
- Hesper realises she healed tonight, far from any Ledger book: her grace is *hers*. Eira: "Of course.
  Did you think the book was doing it?" A captured Auditor (or Crane's orders, found on him) says Morrow
  waits on **Hollin Tor** for an Archive escort, with the box. Hesper: "I want to read it." **Eira
  joins.**

---

## Act III — The Split Penny

### s19 — The Eve of the Tor *(camp below Hollin Tor; night)*
- Map-less (`camp_night`). Small conversations around a fire, each with a payoff:
  - Aldous hears Hesper hum the lark lullaby and stands up and walks away into the dark.
  - Tamsin asks Bren what he swore at Tenpenny; he asks what she swore to her brother.
  - Eira, writing a letter (to whom? — "Home."), asks Jory how many tally marks he has.
  - Bren and Hesper: "What if what's in that box is about me?" "Then it's about you. You'll still be
    you." "You don't know that." "I'm the witness. I know."

### s20 — Saint Ebbe's *(Hollin Tor; dawn)*
- Staged on `map_hollin_tor`. The ruin at the summit, a crossroads arch still standing. Morrow waits by
  the altar with the box and a handful of Auditors and bound Hollows. He speaks to Hesper only. "Come
  home, child. They have filled your head with fen-talk." Hesper: "You killed Odo." "I balanced an
  account." → **B7**.

### B7 — Saint Ebbe's Tor *(Chapter 1 finale)*
- **Map:** `map_hollin_tor` (13×15, dawn). Climb from the downs (h0–2) up a switchback path on the west,
  a steep scramble on the east, rock terraces (h3–9) to the summit ruin (h10–11): broken nave, cloister
  pillars, the crossroads arch, the altar.
- **Objective:** defeat **Morrow**. **Deploy:** Bren, Hesper required; up to 5. Bottom of the tor.
- **Enemies:** Morrow (Auditor L9, boss), 2 Auditor acolytes, 1 Verger, 1 Ledger censor, 1 Hollow
  "wolfkin" (bound), 1 Hollow shade. L7–8.
- **Triggers:** `start` s75 · `turn 3` s76 (Morrow to Hesper: "Your vows would not take. Did you never
  wonder why?") · Bren reaches the arch (`tileReached`) s77 (the lantern flares at the old crossroads;
  Bren hears Odo's laugh) · `Morrow hp<50` s78 ("You do not know what you are fighting for. You never
  did.") · `Hesper hp<40` s79.

### s21 — What Is Written *(Saint Ebbe's summit; morning)*
- Staged on `map_hollin_tor`. Morrow on his knees. Hesper opens the box: the Millbrook intake register
  of 622 AL in Mother Agathe's hand — *"a girl of ten years, fevered… gown of royal weave… says her
  name is Aurelie, says her nurse called her Lark"* — and beneath it a royal Naming certificate, struck
  through in black: **AURELIE ISOLDE VALCOURT**. Hesper reads it aloud. Her accent breaks.
- Morrow confesses: he struck it; Clement ordered it; "I made you nobody, child, so that one day you
  could be everything." Aldous, who has drawn closer, drops to one knee.

### s22 — The Regent *(Saint Ebbe's summit; morning)*
- Staged on `map_hollin_tor`. Horns. Grey cloaks on every side of the tor. Ilka. And behind her, on a
  black horse, the Lord Regent himself: gaunt, ash-veined, coughing. He sees Hesper. "…Lark."
- Morrow: "Lord Regent, the Ledger claims—" Lucan kills him with one stroke. "The Ledger has had her
  twelve years. It may write that down."
- Lucan kneels in the mud before Hesper. "You used to make me say goodnight twice." She doesn't
  remember; then, horribly, she does.
- Ilka moves to arrest the Oathbound — fen outlaws, oathbreakers by Ledger decree, "abductors of the
  heir". Hesper bargains: let them go, and she will come with him freely. Lucan: "Swear it." She turns
  to Bren: "Witness it." He has to. "I witness you." "…And I you." She leaves with the Regent.
- Aldous starts after her; Ilka's blade stops him. "Not you, oathbreaker."

### s23 — Witness Me *(Hollin Tor; noon)*
- Staged on `map_hollin_tor`. Bren alone at the arch with the lantern and his half-penny. The Oathbound
  gather one by one. The Ashguard took the pages but Eira finds a black-edged leaf caught in the box's
  lining, written in Archive cipher except for one line: *"By order of His Grace. Struck."* Tamsin: "So. What now, Lantern?" Bren: "Now we find out who wrote all this. And we
  make them read it out loud." **Hesper leaves the party.**

### s24 — The Black Folio *(the Archive, Aurenne; night — sting)*
- Map-less (`aurenne_archive`). A vault of books. Sister Quire reports to Archscribe Clement: Morrow is
  dead; the Regent has the girl. Clement, gently: "Then the Regent has saved us a long walk." "And the
  sellsword, Your Grace? The unrecorded one?" Clement turns pages in a great black book. "A man with no
  name cannot be struck." He dips his pen. "…Find him one." **End of Chapter One.**

---

## Optional skirmishes (repeatable)

| Id | Where | Unlocked | Enemies | Map |
|---|---|---|---|---|
| `c1_sk_sallowmere` | Sallowmere ruins (Tamsin's village) | after s03 | Hollow hounds, fen tithelings, 1 shade | `map_sallowmere` (12×12, dusk): burned stilt-houses, charred piles, a chapel shell |
| `c1_sk_gibbet` | Gibbet Hill crossroads | after s08 | Struck brigands/highwaymen + wolfkin | `map_gibbet_hill` (12×12, overcast): knoll, gallows, ruined inn, crossroads |
| `c1_sk_kingsbarrow` | Kingsbarrow | after s15 | Restless skeletons, ghouls, barrow troll (rare) | `map_kingsbarrow` (12×12, night): long barrow, standing stones, open passage |
Each has a one-time intro trigger (s85–s87) with flavour dialogue.

## Mid-battle trigger conventions
- Trigger scenes are 2–6 lines, over the battlefield, no staging needed (the camera can pan).
- Named enemies at 0 HP in story battles **withdraw** (Jory, Ilka) unless the outro says otherwise.
  (See SCHEMA_REQUESTS.md: `retreatAt`.)
- Guest allies' KO does not lose the battle unless listed in `defeat`.

## Expansion hooks left open by Chapter 1
- Who is Count Sallis, and whose debts does Tenpenny pay? (C2)
- What did Odo read before he died — and why couldn't he say it? (Besides Aurelie's intake, the box held a
  black-edged Black Folio leaf — the striking of King Edric's Crown Oath, smuggled in by Agathe. Eira has it
  (c1.s23) and will decode it in C2; it becomes the C3 proof that Clement murdered Edric.)
- Aldous and the lullaby. (C2)
- Eira's letters "home". (C4)
- "Find him one." — what happens when the Ledger writes Bren down? (C2: an Auditor tries to Name
  Bren by force so he can be struck; it fails because Bren refuses the oath — Naming needs a willing
  witness or a parent. A key C2 set piece.)
