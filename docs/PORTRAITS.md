# Talking-head portraits

Procedural, layered **pixel-art bust portraits** for dialogue boxes and unit panels. They are generated
from a character's `Appearance` (the same data that drives the LPC battle sprite), so named characters
and random recruits match their sprites. All 8 `Expression`s are supported.

- Core: `src/portraits/` (pure TypeScript, no DOM, deterministic; runs in node, tests and the browser)
- Browser helper: `src/portraits/browser.ts`
- Lab: `portrait-lab.html` + `src/labs/portrait-lab.ts` (`npm run dev` → `/portrait-lab.html`)
- Contact sheets: `node tools/render-portraits.mjs <outDir> [--scale 3] [--only 0,3] [--exprs neutral,happy] [--catalog hair|beard|hat|outfit --cols 8] [--name file]`
- Tests: `tests/portraits.test.ts`

## 1. Research (October 2026) — why we generate our own

We looked for open-licensed (CC0 / CC-BY / CC-BY-SA / OGA-BY) portrait art or generators that are
**layered**, have **expressions**, and would sit next to **LPC** sprites.

| Candidate | Licence | Verdict |
|---|---|---|
| [LPC] Portraits Remix — Basxto & diana23570 ([OGA](https://opengameart.org/content/lpc-portraits-remix)) | CC-BY 4.0 | Closest match (96×96, LPC-palette, selectable skin/hair/emotions), but only **one hairstyle per sex**, no eye colours, no beards/headgear/armour. Covering our 42 hair keys + headgear would mean authoring nearly everything anyway, in someone else's anime style. |
| Anime Portrait for LPC characters — ZeNeRIA29 ([OGA](https://opengameart.org/content/anime-portrait-for-lpc-characters)) | CC-BY-SA 3.0 | 17 fixed, painted (non-pixel) portraits. Not modular; can't match arbitrary appearances. |
| LPC base character expressions — pennomi/laetissima; LPC Expanded Expressions — ElizaWy/JaidynReiman ([OGA](https://opengameart.org/content/lpc-expanded-expressions)) | CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 | Expression overlays for the **64×64 sprite head**, not portraits. Useful reference for expression vocabulary only. |
| Character Portrait Faces — FabinhoSC ([OGA](https://opengameart.org/content/character-portait-faces)) | CC0 | Layered parts, but not pixel art and no LPC style match; tiny part set. |
| pixel-art-portraits — V-ktor ([itch](https://v-ktor.itch.io/pixel-art-portrait-generator), [GitHub](https://github.com/V-ktor/pixel-art-portraits)) | MIT code / CC-BY 4.0 art | Godot project, anime-girl focused, expressions not documented, no armour/helmets/monsters. |
| "Community modular portrait system" thread ([OGA forum](https://opengameart.org/forumtopic/idea-community-modular-portrait-system)) | — | An idea only; no asset was produced. |

**Verdict:** nothing open-licensed covers our needs (all LPC hair/beard keys, headgear, outfits, monsters,
8 expressions, recruit randomisation). We built a procedural generator. No external art is shipped, so
`public/assets/portraits/` is not needed.

**Credits:** colour ramps are copied from the Universal LPC Spritesheet Character Generator
`palette_definitions/*_ulpc.json` (project licensed CC-BY-SA 3.0 / GPL 3.0; see the generator's
CREDITS) so portrait colours match the battle sprites — `src/portraits/lpc-palettes.ts`. Keep this credit
with the LPC credits in the game's credits screen.

## 2. API

```ts
import { renderPortrait } from '@/portraits';
renderPortrait(appearance: Appearance, expression: Expression, opts?: {
  size?: number;      // output px (square), nearest-neighbour; default 96 (native)
  headgear?: string;  // LPC hat key; overrides appearance.outfit.hat (e.g. equipped helmet)
  outfit?: string;    // LPC torso key; overrides appearance.outfit.torso (e.g. job outfit / armour)
  flip?: boolean;     // mirror: native portraits face right (use for left-side dialogue);
                      // flip for the right-hand speaker
}): PortraitImage     // { width, height, data: Uint8ClampedArray RGBA, transparent background }

import { portraitCanvas, portraitDataUrl, portraitKey, clearPortraitCache } from '@/portraits/browser';
```

- Native resolution 96×96. Use integer upscales (2×/3×/4×) with CSS `image-rendering: pixelated`.
- Pure and deterministic: no `Math.random`; per-character variation (eye spacing, jaw, nose shape…) comes
  from a seed = FNV hash of the stable-stringified appearance. ~10 ms per portrait in node.
- Browser helper caches up to 256 canvases / data URLs by `portraitKey` (expression + size + flip +
  appearance hash). Call `clearPortraitCache()` after a dye/cosmetic change if you mutate appearances.
- The frame/background is the UI's job (portrait is transparent outside the bust).

## 3. How appearance maps

| Field | Portrait effect |
|---|---|
| `body` | `female` → narrower jaw/chin, fuller lips, lashes, slimmer neck; `muscular` → `build: broad`. |
| `portrait.build` | slight / average / broad: skull, jaw, chin, neck and shoulder widths. |
| `portrait.age` (or `head` containing *elder/child*) | young: rounder, button nose, higher-set features; old: crow's feet, eye bags, forehead lines, nasolabial folds, hooked nose. |
| `skin` | LPC body ramp (`light`, `amber`, `olive`, `taupe`, `bronze`, `brown`, `black`, `green`, `zombie`, `fur_*`…). |
| `hair` | LPC key → one of 34 portrait styles (table below). `undefined` = bald. |
| `hairColor` | LPC hair ramp; brows use the same ramp. Buzz cuts/mohawk sides blend hair into skin. |
| `beard` | `beards_*` → full / medium / trimmed / stubble / winter / mustache / bigstache / handlebar. |
| `eyes` | LPC eye ramp (iris dark/mid/light + highlight). |
| `ears` | contains *elf/elven/pointed* → pointed ears. |
| `head` | species by keyword: *orc/troll/ogre/boar* → orc (tusks, heavy brow, broad); *goblin/kobold/imp* → goblin ears; *skeleton/skull/lich* → skull (glowing sockets, dropping jaw); *zombie/ghoul* or skin `zombie*` → sunken sockets + stitches; *wolf/dog/fox/minotaur/rat/cat…* → beast muzzle; *lizard/dragon/serpent…* → reptile snout + crest. |
| `outfit.torso.key` | family by keyword: plate (pauldrons, gorget, breastplate), chainmail (ring texture + tabard), robe (crossed collar), leather/jerkin (high collar, pads, lacing), vest/jacket (open over shirt), apron (bib + straps), sleeveless/bare (skin + straps), tunic (V-neck + trim; default). |
| `outfit.torso.color / color2` | cloth or metal ramp names. For plate/chain, a metal `color` sets the armour metal; `color2` (cloth) sets tabard/undercloth. |
| `outfit.cape` (`cape_*`, *cloak/mantle*) | cloak over the shoulders with clasp. |
| `outfit.hat.key` | headgear family: *helm/armet/bascinet/great/visor* → knight (cheek guards, rivets; plume for great/armet/plume); *nasal/spangen/legion* → nasal; *horn/viking* → horned; *kettle/sallet* → kettle; *wizard/magic/celestial/witch* → wizard hat; *hood/cowl* → hood; *cap/leather* → cap; *feather/bard/beret* → feathered cap; *tricorne/bicorne/formal/brim/straw* → wide brim; *bandana/headband* → bandana; *tiara/circlet* → circlet; *crown* → crown. Metal families use metal ramps (`color`, `color2` for trim). |
| `portrait.scar` | left-cheek / right-eye (far eye, brow to cheek) / nose / lip. |
| `portrait.freckles` | freckles across nose and cheeks. |
| `portrait.eyepatch` | left = near eye, right = far eye (as seen on screen); strap over the forehead. |
| `portrait.markings` | free text, not rendered (reserved for bespoke art). |

### Hair key → style

| Portrait style | LPC keys |
|---|---|
| crop | hair_plain |
| bangs / bangsshort / page | hair_bangs / hair_bangsshort / hair_page |
| messy | hair_bedhead, hair_messy1, hair_messy2, hair_unkempt |
| parted / swoop / pixie | hair_parted / hair_swoop / hair_pixie, hair_relm_short |
| spiky | hair_spiked, hair_spiked2 |
| long / longbangs / xlong / longmessy | hair_long, hair_long_straight / hair_sara / hair_xlong / hair_long_messy |
| wavy / curlylong / princess / loose | hair_wavy / hair_curly_long / hair_princess / hair_loose |
| shoulder / halfup | hair_shoulderl / hair_half_up |
| bob / bobside | hair_bob / hair_bob_side_part |
| ponytail / highpony / braid / bun / pigtails / topknot | hair_ponytail, hair_ponytail2 / hair_high_ponytail / hair_braid / hair_bangs_bun / hair_pigtails_bangs / hair_topknot_short |
| curlyshort / afro / dreads | hair_curly_short / hair_afro / hair_dreadlocks_short |
| buzz / cornrows / balding | hair_buzzcut / hair_cornrows / hair_balding |
| shorthawk / longhawk | hair_shorthawk / hair_longhawk |

Unknown keys fall back by keyword (e.g. anything with *long* → long, *pony* → ponytail), then `crop`.

## 4. How it works

`Scene` (`scene.ts`) is a 96×96 buffer of **(object, ramp, level)** per pixel. Layers are painted
back-to-front as signed-distance shapes (ellipses, smoothed polygons, tapered bezier "locks") or
hand-authored sprites, each pixel picking a ramp level (0 outline … 5 highlight) from a shading function
with a single **top-left key light**. Then post passes give the pixel-art finish:

1. **Spur cleanup** — removes 1-px stair spikes from silhouettes.
2. **Cast shadows** — anything in front darkens what's behind it 1–2 px down-right (hair → forehead,
   brims → face, chin → neck).
3. **Orphan cleanup** — single pixels of a stray level are merged into their cluster (clusters, not noise).
4. **Selective outlines** — darkest ramp step against the background, lighter step on the lit top/left
   edges and where a shape overlaps another (hue-correct, not black), thin darker lines between hair
   clumps of the same family.

Layer order: headgear back (hood back, far horn, plume) → back hair → neck → torso/outfit → far ear →
face → near ear → jaw beard → eyes/brows/nose/mouth/extras → mustache → front hair (cap, bangs,
side locks) → eyepatch → headgear front → cloak.

Faces are a slight **3/4 view** facing right: facial features are placed on a rotated head surface
(`fx()` in `context.ts`), so the far eye is foreshortened and the jaw shifts. Expressions are
hand-authored pixel sprites (`features.ts`): eyes (near eye authored, far eye mirrored and narrowed),
brows (with per-expression offsets and asymmetric brows for smirk), mouths (soft-lip variants for
female/young), plus cues — blush (happy), tear (sad), sweat drop + squeezed eye (hurt), brow knit
(angry/determined/hurt). Beasts and skulls reuse the eye/brow sprites (or socket/glow variants) with
species-specific mouths (jaw drop, fangs).

## 5. Known limitations / next steps

- One head angle (3/4 facing right; `flip` mirrors, which also mirrors the light). No hand-painted
  bespoke portraits yet — `portrait.markings` is the hook for story characters who need unique art
  (tattoos, face paint); a future `PortraitOverride` image could replace the generator per character.
- Very dark skin ramps (`black`, `brown`) have low internal contrast; features rely on outlines.
- Hair on top of the head is a single "cap" with streak shading; complex updos (half-up, topknot) are
  approximations. Some very long styles look curtain-like.
- Hats sit on a fixed head shape; extreme hair volume (afro) under a helmet is simply hidden.
- Beast/lizard heads are simpler than human heads (fewer planes, smaller eyes); other monster heads
  (minotaur, rat, boar…) map onto wolf/orc.
- Clothing below the collar is generic per family; weapons/accessories aren't shown.
- No lip-sync mouth frames yet. Voice-acted dialogue could alternate `neutral`/`surprised` mouths or we
  can add a 3-frame `talk` mouth set per expression in `features.ts` cheaply.
