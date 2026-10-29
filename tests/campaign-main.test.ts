import { describe, expect, it } from 'vitest';
import { EXPRESSIONS } from '../src/content/schema';
import type { SceneDef } from '../src/content/schema';
import mainCampaign, { maps, enemies, regions } from '../src/content/campaigns/main';

const pack = mainCampaign;
const VO_RE = /^main\.c1\.s(\d{2})\.\d{3}[a-z]?$/;
const TOKEN_RE = /^(x|[gtdrsbawWonmfcl]\d{1,2})$/;
const MAX_LINE = 180;

const GENERIC_JOBS = ['squire', 'alchemist', 'knight', 'ranger', 'cleric', 'wizard', 'monk', 'rogue', 'chronomancer',
  'hexer', 'lancer', 'warden', 'invoker', 'spellblade', 'shadowblade', 'oathbreaker'];
const STORY_JOBS = ['lanternbearer', 'ashguard', 'inquisitor', 'archscribe', 'sovereign'];
const MONSTER_JOBS = ['wolfkin', 'hollow', 'skeleton', 'ghoul', 'goblin', 'gaunt', 'brute', 'boarman', 'minotaur', 'troll', 'lizardfolk'];
const JOBS = new Set([...GENERIC_JOBS, ...STORY_JOBS, ...MONSTER_JOBS]);

type XY = [number, number];

function tileAt(mapId: string, [x, y]: XY): string | undefined {
  const m = maps[mapId];
  const row = m?.rows[y];
  if (!row) return undefined;
  return row.split(' ')[x];
}

function hasProp(mapId: string, [x, y]: XY): boolean {
  return (maps[mapId].props ?? []).some((p) => p.at[0] === x && p.at[1] === y);
}

/** A tile a unit can stand on: exists, not void, not deep water, no prop. */
function standable(mapId: string, at: XY): boolean {
  const t = tileAt(mapId, at);
  if (!t || t === 'x' || t[0] === 'W') return false;
  return !hasProp(mapId, at);
}

const allScenes = Object.values(pack.scenes);

describe('main campaign — maps', () => {
  for (const [id, m] of Object.entries(maps)) {
    it(`${id} is well-formed`, () => {
      expect(m.id).toBe(id);
      expect(m.rows.length).toBeGreaterThanOrEqual(10);
      const width = m.rows[0].split(' ').length;
      expect(width).toBeGreaterThanOrEqual(10);
      for (const [y, row] of m.rows.entries()) {
        const toks = row.split(' ');
        expect(toks.length, `${id} row ${y} token count`).toBe(width);
        for (const tok of toks) expect(tok, `${id} row ${y} token "${tok}"`).toMatch(TOKEN_RE);
        for (const tok of toks) if (tok !== 'x') expect(Number(tok.slice(1))).toBeLessThanOrEqual(12);
      }
      for (const p of m.props ?? []) {
        const t = tileAt(id, p.at);
        expect(t, `${id} prop at ${p.at}`).toBeDefined();
        expect(t === 'x' || t?.[0] === 'W', `${id} prop ${p.type} on void/deep water at ${p.at}`).toBe(false);
      }
    });
  }
});

describe('main campaign — characters & enemies', () => {
  it('character ids match keys and use known jobs', () => {
    for (const [k, c] of Object.entries(pack.characters)) {
      expect(c.id).toBe(k);
      expect(JOBS.has(c.job), `${k} job ${c.job}`).toBe(true);
    }
  });
  it('enemy template ids match keys and use known jobs', () => {
    for (const [k, e] of Object.entries(enemies)) {
      expect(e.id).toBe(k);
      expect(JOBS.has(e.job), `${k} job ${e.job}`).toBe(true);
    }
  });
});

describe('main campaign — scenes', () => {
  it('scene ids match keys and reference valid locations/maps', () => {
    for (const [k, s] of Object.entries(pack.scenes)) {
      expect(s.id).toBe(k);
      expect(k).toMatch(/^c1\.s\d{2}$/);
      expect(pack.locations[s.location], `${k} location ${s.location}`).toBeDefined();
      if (s.map) expect(maps[s.map], `${k} map ${s.map}`).toBeDefined();
    }
  });

  it('VO ids are unique, well-formed and match their scene number', () => {
    const seen = new Set<string>();
    for (const s of allScenes) {
      const nn = s.id.slice(-2);
      for (const st of s.steps) {
        if (st.kind !== 'line' && st.kind !== 'narration' && st.kind !== 'choice') continue;
        const m = VO_RE.exec(st.id);
        expect(m, `bad VO id ${st.id}`).not.toBeNull();
        expect(m![1], `${st.id} in scene ${s.id}`).toBe(nn);
        expect(seen.has(st.id), `duplicate VO id ${st.id}`).toBe(false);
        seen.add(st.id);
      }
    }
    expect(seen.size).toBeGreaterThan(300);
  });

  it('every line has a known speaker, a valid expression and fits a talking-head box', () => {
    for (const s of allScenes) {
      for (const st of s.steps) {
        if (st.kind === 'line') {
          const known = !!pack.characters[st.speaker] || !!enemies[st.speaker];
          expect(known, `${st.id} unknown speaker ${st.speaker}`).toBe(true);
          if (st.expression) expect(EXPRESSIONS).toContain(st.expression);
          expect(st.text.length, `${st.id} too long`).toBeLessThanOrEqual(MAX_LINE);
          expect(st.text.trim().length).toBeGreaterThan(0);
        }
        if (st.kind === 'narration') expect(st.text.length, `${st.id} too long`).toBeLessThanOrEqual(MAX_LINE);
      }
    }
  });

  it('gotos and choices target existing labels', () => {
    for (const s of allScenes) {
      const labels = new Set(s.steps.flatMap((st) => (st.kind === 'label' ? [st.name] : [])));
      for (const st of s.steps) {
        if (st.kind === 'goto') expect(labels.has(st.label), `${s.id} goto ${st.label}`).toBe(true);
        if (st.kind === 'choice') {
          expect(st.options.length).toBeGreaterThanOrEqual(2);
          for (const o of st.options) if (o.goto) expect(labels.has(o.goto), `${s.id} choice goto ${o.goto}`).toBe(true);
        }
      }
    }
  });

  it('staged actors are characters placed on standable tiles', () => {
    const check = (s: SceneDef, actor: string | undefined, at?: XY) => {
      if (actor) expect(pack.characters[actor] ?? s.actors?.[actor], `${s.id} actor ${actor}`).toBeDefined();
      if (at) {
        expect(s.map, `${s.id} staging without a map`).toBeDefined();
        expect(standable(s.map!, at), `${s.id} ${actor} at ${at}`).toBe(true);
      }
    };
    for (const s of allScenes) {
      for (const [k, a] of Object.entries(s.actors ?? {})) {
        expect(pack.characters[a.character], `${s.id} actor ${k}`).toBeDefined();
        check(s, undefined, a.at);
      }
      for (const st of s.steps) {
        if (st.kind !== 'stage') continue;
        if (st.action === 'walk' || st.action === 'place') check(s, st.actor, st.to);
        else if (st.actor) check(s, st.actor);
        if (st.action === 'background') expect(pack.locations[st.value!], `${s.id} bg ${st.value}`).toBeDefined();
      }
    }
  });
});

describe('main campaign — battles', () => {
  for (const [k, b] of Object.entries(pack.battles)) {
    it(`${k} references valid content and tiles`, () => {
      expect(b.id).toBe(k);
      expect(maps[b.map], `${k} map`).toBeDefined();
      expect(pack.locations[b.location], `${k} location`).toBeDefined();
      if (b.introScene) expect(pack.scenes[b.introScene], `${k} intro`).toBeDefined();
      if (b.outroScene) expect(pack.scenes[b.outroScene], `${k} outro`).toBeDefined();
      for (const r of b.required ?? []) expect(pack.characters[r], `${k} required ${r}`).toBeDefined();
      expect(b.maxDeploy).toBeLessThanOrEqual(5);
      expect(b.deployTiles.length).toBeGreaterThanOrEqual(b.maxDeploy);

      const occupied = new Set<string>();
      for (const t of b.deployTiles) {
        expect(standable(b.map, t), `${k} deploy tile ${t}`).toBe(true);
        expect(occupied.has(String(t)), `${k} duplicate deploy ${t}`).toBe(false);
        occupied.add(String(t));
      }
      const unitIds = new Set<string>();
      for (const u of b.units) {
        expect(unitIds.has(u.id), `${k} duplicate unit id ${u.id}`).toBe(false);
        unitIds.add(u.id);
        expect(!!u.character !== !!u.template, `${k} ${u.id} needs exactly one of character/template`).toBe(true);
        if (u.character) expect(pack.characters[u.character], `${k} ${u.id} character`).toBeDefined();
        if (u.template) expect(enemies[u.template], `${k} ${u.id} template ${u.template}`).toBeDefined();
        expect(standable(b.map, u.at), `${k} ${u.id} at ${u.at}`).toBe(true);
        expect(occupied.has(String(u.at)), `${k} ${u.id} overlaps another unit/deploy tile at ${u.at}`).toBe(false);
        occupied.add(String(u.at));
      }
      const enemyCount = b.units.filter((u) => u.team === 'enemy').length;
      expect(enemyCount).toBeGreaterThanOrEqual(5);
      expect(enemyCount).toBeLessThanOrEqual(9);

      const unitRef = (id: string) => unitIds.has(id) || !!pack.characters[id];
      const v = b.victory;
      if (v.type === 'defeatTarget' || v.type === 'protect') expect(unitRef(v.target), `${k} victory target`).toBe(true);
      if (v.type === 'escape' || v.type === 'reach') for (const t of v.tiles) expect(standable(b.map, t), `${k} goal ${t}`).toBe(true);
      for (const d of b.defeat ?? []) if (d.type === 'protect' || d.type === 'defeatTarget') expect(unitRef(d.target)).toBe(true);

      for (const tr of b.triggers ?? []) {
        if (tr.scene) expect(pack.scenes[tr.scene], `${k} trigger ${tr.id} scene`).toBeDefined();
        for (const r of tr.reveal ?? []) {
          const u = b.units.find((x) => x.id === r);
          expect(u?.hidden, `${k} reveal ${r} must be a hidden unit`).toBe(true);
        }
        const w = tr.when;
        if (w.type === 'unitHp' || w.type === 'unitDefeated') expect(unitRef(w.unit), `${k} trigger unit ${w.unit}`).toBe(true);
        if (w.type === 'tileReached') for (const t of w.tiles) expect(standable(b.map, t), `${k} trigger tile ${t}`).toBe(true);
      }
    });
  }
});

describe('main campaign — chapter flow & world', () => {
  const nodeIds = new Set(pack.world.nodes.map((n) => n.id));

  it('world nodes/edges/regions are consistent (KMU 0..1023)', () => {
    expect(nodeIds.size).toBe(pack.world.nodes.length);
    expect(nodeIds.has(pack.world.start)).toBe(true);
    for (const n of pack.world.nodes) {
      for (const c of n.pos) expect(c >= 0 && c <= 1023, `${n.id} pos`).toBe(true);
      for (const s of n.skirmishes ?? []) {
        expect(pack.battles[s], `${n.id} skirmish ${s}`).toBeDefined();
        expect(pack.battles[s].repeatable).toBe(true);
      }
    }
    for (const e of pack.world.edges) {
      expect(nodeIds.has(e.from), `edge from ${e.from}`).toBe(true);
      expect(nodeIds.has(e.to), `edge to ${e.to}`).toBe(true);
    }
    for (const r of regions) {
      const [x0, y0, x1, y1] = r.box;
      expect(x0 <= x1 && y0 <= y1 && x0 >= 0 && y1 <= 1023, `${r.id} box`).toBe(true);
      for (const t of r.roaming) expect(enemies[t], `${r.id} roaming ${t}`).toBeDefined();
    }
  });

  it('every chapter beat references existing content', () => {
    for (const ch of pack.chapters) {
      for (const beat of ch.beats) {
        switch (beat.kind) {
          case 'scene':
            expect(pack.scenes[beat.scene], `beat scene ${beat.scene}`).toBeDefined();
            if (beat.at) expect(nodeIds.has(beat.at), `beat at ${beat.at}`).toBe(true);
            break;
          case 'battle':
            expect(pack.battles[beat.battle], `beat battle ${beat.battle}`).toBeDefined();
            expect(nodeIds.has(beat.at), `beat at ${beat.at}`).toBe(true);
            break;
          case 'unlockNode':
            expect(nodeIds.has(beat.node), `unlock ${beat.node}`).toBe(true);
            break;
          case 'join':
          case 'leave':
            expect(pack.characters[beat.character], `${beat.kind} ${beat.character}`).toBeDefined();
            break;
        }
      }
    }
    for (const c of pack.startingParty) expect(pack.characters[c]).toBeDefined();
  });

  it('every non-skirmish scene is reachable from the chapter (beat, intro/outro or trigger)', () => {
    const used = new Set<string>();
    for (const ch of pack.chapters) for (const b of ch.beats) if (b.kind === 'scene') used.add(b.scene);
    for (const b of Object.values(pack.battles)) {
      if (b.introScene) used.add(b.introScene);
      if (b.outroScene) used.add(b.outroScene);
      for (const t of b.triggers ?? []) if (t.scene) used.add(t.scene);
    }
    for (const id of Object.keys(pack.scenes)) expect(used.has(id), `orphan scene ${id}`).toBe(true);
  });
});
