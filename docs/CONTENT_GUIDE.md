# Content Guide — adding chapters, packs, jobs and items

## Adding a chapter to the main campaign

1. Plan it in `docs/story/BIBLE.md` (§8 saga outline) and write a beat sheet in
   `docs/story/chapters/chapterN.md`.
2. Write the screenplay in `docs/story/script/actN.txt` and compile with
   `python3 docs/story/script/compile.py` — this validates speakers, expressions, the 180-character
   box limit and staging, and writes `src/content/campaigns/main/chapterN/scenes/*.ts` plus the VO script.
3. Add battles (`chapterN/battles.ts`) and maps (`maps.ts`). Maps are rows of `terrain+height`
   tokens (`g2 s4 x …`), props by tile, and a theme.
4. Add the `ChapterDef` (`chapterN/index.ts`) and register it in `main/index.ts`.
5. Run `npm test`. `tests/campaign-main.test.ts` checks referential integrity;
   `tests/story-battles.test.ts` auto-plays battles to check they load and are winnable.

**Voice-over ids are permanent.** Never renumber `main.cN.sNN.NNN`; append or suffix (`014a`).
Recorded files go to `public/voice/<locale>/<id>.ogg` and play automatically.

## Making a purchasable campaign pack

A pack is a folder under `src/content/campaigns/<id>/` exporting a `CampaignPack`
(`src/content/schema.ts`) plus maps and enemy templates, registered with
`registerPack()` (`src/game/campaignData.ts`). Packs can add jobs, abilities and items via
`registerJobs/registerAbilities/registerItems`. Store metadata lives in `CampaignPack.store`.
Packs may set their world region in the frontier outside the kingdom (see BIBLE §6A).

## Jobs and abilities

- Generic jobs: `src/content/jobs.ts`; abilities: `src/content/abilities.ts`.
- Story and monster jobs: `src/content/storyJobs.ts`.
- An ability is data: range, AoE, charge speed, hit spec and a list of effects (`damage`, `heal`,
  `addStatus`, `revive`, `modStat`, `break`, `steal`, `knockback`, `consume`, …). Formulas:
  `weapon`, `magic`, `stat`, `mix`, `fist`, `monster`, `pctMax`, `pctCurrent`, `casterMissing`.
- Balance yardsticks: a mid-game unit has ~120–180 HP; a weapon hit lands for 30–50; tier-1 spells
  ~40; tier-3 ~100. `tests/story-battles.test.ts` is the regression check for story difficulty.

## Items and visuals

Items live in `src/content/items.ts`. `visual` lists LPC layers (catalogue keys from
`public/assets/lpc/catalog.json`) drawn when equipped. `tests/visuals.test.ts` verifies every key
exists. To import more LPC art, add keys to `tools/lpc-items.json` and run `npm run assets:lpc`
(credits regenerate automatically).

## Cosmetics (future shop)

Cosmetics must never change stats. Dyes are palette recolours of any layer (`LayerRef.color`);
cloaks/hats/visual overrides go in `Appearance.outfit`. Portraits follow headgear/outfit keys.
