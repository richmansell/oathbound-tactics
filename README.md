# Oathbound Tactics

An original isometric tactics RPG in the spirit of *Final Fantasy Tactics* — job mixing, Clock-Time
turn order, height and facing, Brave and Faith — with its own world, story and systems: **Battle
Oaths**, a free-roam overworld, story campaigns sold as packs, and online play on the same rules engine.

> Status: **v1 demo** — Chapter 1 *The Split Penny* (7 story battles, 3 skirmishes, ~1,000 voice-ready
> lines), a free-roam procedural kingdom (4096² tiles of a 30,000² world) with roaming encounters
> carved from the terrain, 16 generic jobs + story and monster jobs, Battle Oaths, a wardrobe, and
> online duels on an authoritative server.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # engine, content, story-battle and online tests
npm run server       # optional: online match server on ws://localhost:8787
```

Dev URLs: `/?sandbox=battle` (quick battle), `/?scene=c1.s05` (any scene), `/?battle=c1_b3_millbrook&lv=5` (any story battle),
`/sprite-lab.html`, `/portrait-lab.html`, `/audio-lab.html`, `/world-lab.html`.

## What's in the box

| Area | Where | Notes |
|---|---|---|
| Rules engine | `src/engine/` | Pure, deterministic, JSON state, command-based. Runs in browser, Node and tests. |
| Content | `src/content/` | Jobs, abilities, items, statuses, Oaths, story/monster jobs. |
| Campaign packs | `src/content/campaigns/<pack>/` | Story data (characters, scenes, battles, maps, world). Base game = `main`. |
| Story bible | `docs/story/` | World, characters, saga outline, Chapter 1 beat sheet, VO script. |
| Renderer | `src/render/` | Isometric canvas renderer, procedural terrain/props/VFX, LPC sprite compositor. |
| UI | `src/ui/` | Preact screens: title, world map, battle HUD, scenes, party/jobs/equipment, towns. |
| Portraits | `src/portraits/` | Procedural pixel-art talking heads with 8 expressions. |
| Audio | `src/audio/` | Music + SFX engine, VO hook (`voice/<locale>/<lineId>.ogg`). |
| World | `src/world/` | Procedural chunked overworld + hand-authored set pieces + battlefield carving. |
| Online | `src/net/`, `server/` | Authoritative WebSocket match server; clients replay commands in lockstep. |

Docs: [DESIGN](docs/DESIGN.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [CONTENT GUIDE](docs/CONTENT_GUIDE.md) ·
[STORY BIBLE](docs/story/BIBLE.md) · [AUDIO](docs/AUDIO.md) · [PORTRAITS](docs/PORTRAITS.md)

## Credits and licences

Character sprites: **Liberated Pixel Cup** contributors (CC-BY-SA 3.0 / GPL 3.0 / OGA-BY 3.0 / CC0), per-file
credits in `public/assets/lpc/CREDITS.md`. Music and SFX: see `public/assets/audio/CREDITS.md`
(Jonathan Shaw, Kevin MacLeod, leohpaz, Kenney and others). Everything else is original to this project.
The in-game Credits screen shows all attributions.
