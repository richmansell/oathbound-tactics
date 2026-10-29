# Architecture

## Layers

```
            ┌──────────────── UI (Preact) ────────────────┐
            │ Title · World map · Town · Party · Scene ·  │
            │ Battle HUD · Online                          │
            └──────┬──────────────────────┬───────────────┘
                   │                      │
     game/ (campaign runner, save,   render/ (BattleView, Animator,
     state store, BattleSession)      terrain, props, VFX, sprites)
                   │                      │
                   └──────────┬───────────┘
                         engine/  ← content/ (jobs, abilities, items, oaths, packs)
                              │
                     server/ + net/ (same engine, authoritative)
```

## Engine (src/engine)

- **State is plain JSON** (`BattleState`): units, map, CT clock, pending charged actions, triggers,
  inventories, RNG state. No classes or functions in state.
- **One entry point:** `applyCommand(state, cmd) → { state, events }`. Commands: `deploy`, `move`,
  `undoMove`, `act`, `wait`. The engine clones state, validates, resolves and advances the clock
  to the next controllable turn.
- **Deterministic:** randomness comes only from `state.rng` (mulberry32). Same initial state + same
  commands ⇒ same result on every machine. This is what makes replays, lockstep and server
  authority possible.
- **Events** (`BattleEvent[]`) describe what happened (move path, damage, status, KO, reaction,
  trigger…) for the animator. The renderer never needs to diff state.
- Modules: `battle.ts` (lifecycle, clock, triggers, victory), `combat.ts` (formulas, hit chance,
  effects, reactions, KO, rewards), `movement.ts`, `targeting.ts`, `units.ts` (derived stats,
  passives, equipment rules), `progression.ts` (EXP/JP/job levels/learning), `oaths.ts`,
  `ai.ts` (pure planner), `factory.ts` (unit builds, auto-learn/equip).

## Battle presentation

`BattleSession` (game/) owns state and routes commands from a *source*: local human, AI
(`planTurn`), or a `RemoteLink` (online). Each applied command's events are played by the
`Animator` on the `BattleView` (render/), which draws:

- terrain columns (procedurally rasterised per terrain/height/variant, cached),
- props (procedural pixel art), units (LPC composited sheets) sorted by isometric depth,
- highlights, cursor, VFX particles/glyphs, and a full-resolution overlay for numbers and HP bars.

The UI (`ui/battle/BattleScreen.tsx`) holds the input state machine (menu → move/skill/target →
facing) and the deploy screen (formation + Oaths).

## Story mode

`game/campaign.ts` walks a pack's `ChapterDef.beats`: instant beats (join, leave, unlock, shop,
flag, unlockJob) apply immediately; scenes and battles bound to a world location (`at`) wait for
the player to travel there. `App.tsx` is the director: scene → battle (intro scene, deploy,
mid-battle trigger scenes as talking-head overlays, outro scene) → autosave → next beat.

## World

`src/world/` generates an effectively endless overworld per 32×32 chunk from a seed, with
hand-authored set pieces stamped in (towns, castles, landmarks). Only deltas are saved. Battles
outside story set pieces are carved from the local terrain (`carveBattlefield`).

## Online

`server/` runs authoritative matches with the shared engine. Clients send intents
(`cmd`/`deploy`); the server checks turn ownership and legality, applies, and broadcasts the
command and a state hash. Clients replay commands locally for animation and verify hashes
(resync on mismatch). Player builds are sanitised server-side (`net/validate.ts`) and levels are
normalised for PvP. See `tests/online.test.ts` for a full lockstep match.

## Persistence

`game/save.ts`: versioned JSON save slots (`auto`, `1–3`) in localStorage, wrapped in try/catch
(mobile webviews, private mode). The same `GameState` JSON can be synced to a server later.

## Platforms

Web first. Touch-first UI (tap to select, tap again to confirm, drag to pan, pinch to zoom),
safe-area aware CSS, no platform APIs in game code. Wrap with Capacitor for iOS/Android.

## Shipping to iOS / Android

The web build is self-contained (`base: './'`, local fonts, local assets), so it runs from a native
webview. With Xcode / Android Studio installed:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm run build
npx cap add ios && npx cap add android
npx cap sync && npx cap open ios   # or android
```

`capacitor.config.json` is already set up. The web app is also installable (PWA manifest + icons).
