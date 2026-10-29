/**
 * Portrait lab: sample characters + seeded random recruits × all expressions.
 * Open /portrait-lab.html with the Vite dev server.
 */
import { EXPRESSIONS, type Appearance, type BodyType } from '../content/schema';
import { portraitCanvas } from '../portraits/browser';
import { BEARD_MAP, HAIR_MAP } from '../portraits/mapping';
import { PORTRAIT_SAMPLES, type PortraitSample } from '../portraits/samples';

const SKINS = ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown', 'black'];
const HAIR_COLORS = ['black', 'dark_brown', 'chestnut', 'light_brown', 'blonde', 'ginger', 'redhead', 'platinum', 'gray', 'white', 'raven', 'navy', 'rose'];
const EYES = ['blue', 'green', 'brown', 'gray', 'purple', 'orange'];
const CLOTH = ['blue', 'navy', 'red', 'maroon', 'forest', 'green', 'teal', 'brown', 'leather', 'white', 'charcoal', 'purple', 'tan'];
const TORSOS = ['torso_clothes_tunic', 'torso_clothes_robe', 'torso_armour_plate', 'torso_leather', 'torso_chainmail', 'torso_aprons_apron', 'torso_clothes_vest'];
const HATS = [undefined, undefined, undefined, 'hat_helmet_armet', 'hat_helmet_nasal', 'hat_helmet_kettle', 'hat_magic_wizard', 'hat_hood_cloth', 'hat_cap_leather', 'hat_bandana', 'hat_tiara', 'hat_cap_feather', 'hat_formal_tricorne', 'hat_helmet_horned', 'hat_crown'];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRecruit(seed: number): PortraitSample {
  const r = rng(seed);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const body: BodyType = pick(['male', 'female', 'muscular']);
  const torso = pick(TORSOS);
  const hat = pick(HATS);
  const ap: Appearance = {
    body,
    skin: pick(SKINS),
    hair: r() < 0.06 ? undefined : pick(Object.keys(HAIR_MAP)),
    hairColor: pick(HAIR_COLORS),
    eyes: pick(EYES),
    beard: body !== 'female' && r() < 0.45 ? pick(Object.keys(BEARD_MAP)) : undefined,
    ears: r() < 0.15 ? 'ears_elven' : undefined,
    outfit: {
      torso: { key: torso, color: torso.includes('plate') ? 'steel' : torso.includes('chain') ? 'iron' : pick(CLOTH), color2: pick(CLOTH) },
      ...(hat ? { hat: { key: hat, color: hat.includes('helmet') || hat.includes('tiara') || hat.includes('crown') ? pick(['steel', 'iron', 'gold', 'bronze']) : pick(CLOTH) } } : {}),
    },
    portrait: {
      age: pick(['young', 'adult', 'adult', 'old']),
      freckles: r() < 0.2,
      scar: r() < 0.15 ? pick(['left-cheek', 'right-eye', 'nose', 'lip'] as const) : undefined,
      eyepatch: r() < 0.06 ? pick(['left', 'right'] as const) : undefined,
    },
  };
  return { name: `Recruit #${seed}`, appearance: ap };
}

let scale = 3;
let flip = false;
let recruitSeed = 1;

function render() {
  const grid = document.getElementById('grid')!;
  grid.innerHTML = '';
  const head = document.createElement('tr');
  head.appendChild(document.createElement('th'));
  for (const e of EXPRESSIONS) {
    const th = document.createElement('th');
    th.textContent = e;
    head.appendChild(th);
  }
  grid.appendChild(head);
  const rows = [...PORTRAIT_SAMPLES, ...Array.from({ length: 6 }, (_, i) => randomRecruit(recruitSeed * 100 + i))];
  const t0 = performance.now();
  for (const s of rows) {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.className = 'name';
    name.textContent = s.name;
    tr.appendChild(name);
    for (const e of EXPRESSIONS) {
      const td = document.createElement('td');
      const frame = document.createElement('div');
      frame.className = 'frame';
      const src = portraitCanvas(s.appearance, e, { headgear: s.headgear, outfit: s.outfit, flip });
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.style.width = `${src.width * scale}px`;
      c.style.height = `${src.height * scale}px`;
      c.getContext('2d')!.drawImage(src, 0, 0);
      frame.appendChild(c);
      td.appendChild(frame);
      td.title = `${s.name} — ${e}`;
      tr.appendChild(td);
    }
    grid.appendChild(tr);
  }
  document.getElementById('stats')!.textContent = `${rows.length * EXPRESSIONS.length} portraits in ${Math.round(performance.now() - t0)} ms`;
}

function controls() {
  const scales = document.getElementById('scales')!;
  for (const s of [1, 2, 3, 4]) {
    const b = document.createElement('button');
    b.textContent = `${s}×`;
    b.className = s === scale ? 'on' : '';
    b.onclick = () => {
      scale = s;
      scales.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      render();
    };
    scales.appendChild(b);
  }
  const fb = document.getElementById('flip')!;
  fb.onclick = () => { flip = !flip; fb.classList.toggle('on', flip); render(); };
  document.getElementById('reroll')!.onclick = () => { recruitSeed++; render(); };
}

controls();
render();
