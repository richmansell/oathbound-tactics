#!/usr/bin/env node
/**
 * LPC sprite importer for Oathbound Tactics.
 *
 *   npm run assets:lpc                 # full import
 *   npm run assets:lpc -- --only body,hair_plain   # subset (writes a partial catalogue! for debugging)
 *   npm run assets:lpc -- --plan       # resolve + report, fetch/write nothing
 *
 * Reads the curated list in tools/lpc-items.json, resolves each sheet definition of the
 * Universal LPC Spritesheet Character Generator at a pinned commit, fetches exactly the PNG
 * blobs needed (blobless partial clone, objects fetched by id — no working tree needed),
 * re-encodes them losslessly as small indexed PNGs, and writes:
 *
 *   public/assets/lpc/<upstream spritesheets path>.png
 *   public/assets/lpc/catalog.json
 *   public/assets/lpc/CREDITS.md + CREDITS.csv   (legal requirement: keep every credit)
 *
 * The clone lives in $LPC_GEN_DIR (default: <os tmp>/oathbound-lpc-gen) and is created on demand.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'tools/lpc-items.json');
const OUT_DIR = path.join(ROOT, 'public/assets/lpc');
const GEN_DIR = process.env.LPC_GEN_DIR || path.join(os.tmpdir(), 'oathbound-lpc-gen');
const CACHE_DIR = path.join(GEN_DIR, '.oathbound-png-cache');

const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const PLAN_ONLY = args.includes('--plan');
const ONLY = argValue('--only')?.split(',').map((s) => s.trim()).filter(Boolean);

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const REF = config.source.ref;

/** Upstream `animations` entry → folder name of the standard sheet it lives in. */
const ANIM_ALIASES = {
  combat: 'combat_idle',
  '1h_slash': 'backslash',
  '1h_backslash': 'backslash',
  '1h_halfslash': 'halfslash',
};
/** Used upstream when a definition omits `animations`. */
const ANIMATION_DEFAULTS = ['spellcast', 'thrust', 'walk', 'slash', 'shoot', 'hurt', 'watering'];
/** Rows per standard sheet (everything else has 4 rows: n, w, s, e). */
const SINGLE_ROW_ANIMS = new Set(['hurt', 'climb']);
const DIRS = ['n', 'w', 's', 'e'];

const log = (...a) => console.log(...a);
const warnings = [];
const warn = (msg) => {
  warnings.push(msg);
  console.warn('  ! ' + msg);
};

// ---------------------------------------------------------------------------
// git object access (blobless partial clone, fetch blobs by id)
// ---------------------------------------------------------------------------

function git(argv, { input, env } = {}) {
  return execFileSync('git', ['-C', GEN_DIR, ...argv], {
    input,
    env: { ...process.env, ...env },
    maxBuffer: 1 << 30,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function ensureRepo() {
  if (!fs.existsSync(path.join(GEN_DIR, '.git')) && !fs.existsSync(path.join(GEN_DIR, 'HEAD'))) {
    log(`Cloning ${config.source.repo} (blobless) into ${GEN_DIR} …`);
    fs.mkdirSync(path.dirname(GEN_DIR), { recursive: true });
    execFileSync('git', ['clone', '--filter=blob:none', '--no-checkout', config.source.repo, GEN_DIR], {
      stdio: 'inherit',
    });
  }
  try {
    git(['cat-file', '-e', `${REF}^{commit}`], { env: { GIT_NO_LAZY_FETCH: '1' } });
  } catch {
    log(`Fetching ${REF} …`);
    git(['fetch', '--filter=blob:none', 'origin', REF]);
  }
}

/** Map of repo path → blob id for everything under the given prefixes at REF. */
function listTree(prefixes) {
  const out = git(['ls-tree', '-r', REF, '--', ...prefixes]).toString('utf8');
  const map = new Map();
  for (const line of out.split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    const [, type, oid] = line.slice(0, tab).split(' ');
    if (type === 'blob') map.set(line.slice(tab + 1), oid);
  }
  return map;
}

function missingBlobs(oids) {
  if (!oids.length) return [];
  const out = git(['cat-file', '--batch-check'], {
    input: oids.join('\n') + '\n',
    env: { GIT_NO_LAZY_FETCH: '1' },
  }).toString('utf8');
  return out
    .split('\n')
    .filter((l) => l.endsWith(' missing'))
    .map((l) => l.split(' ')[0]);
}

function fetchBlobs(oids) {
  const unique = [...new Set(oids)];
  const missing = missingBlobs(unique);
  if (!missing.length) return;
  log(`  fetching ${missing.length} blobs …`);
  for (let i = 0; i < missing.length; i += 1500) {
    const chunk = missing.slice(i, i + 1500);
    git(
      ['-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '--stdin', '--no-tags', '--no-write-fetch-head',
        '--recurse-submodules=no', 'origin'],
      { input: chunk.join('\n') + '\n' },
    );
  }
  const still = missingBlobs(unique);
  if (still.length) throw new Error(`Could not fetch ${still.length} blobs (e.g. ${still[0]})`);
}

/** Read blobs (must already be present) → Map oid → Buffer. */
function readBlobs(oids) {
  const unique = [...new Set(oids)];
  const result = new Map();
  for (let i = 0; i < unique.length; i += 2000) {
    const chunk = unique.slice(i, i + 2000);
    const buf = git(['cat-file', '--batch'], { input: chunk.join('\n') + '\n', env: { GIT_NO_LAZY_FETCH: '1' } });
    let pos = 0;
    while (pos < buf.length) {
      const nl = buf.indexOf(10, pos);
      const header = buf.toString('utf8', pos, nl).split(' ');
      const size = Number(header[2]);
      if (header[1] !== 'blob' || !Number.isFinite(size)) throw new Error(`cat-file: ${header.join(' ')}`);
      result.set(header[0], buf.subarray(nl + 1, nl + 1 + size));
      pos = nl + 1 + size + 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// PNG helpers: decode, lossless indexed re-encode, recolour (for verification)
// ---------------------------------------------------------------------------

function decodePng(buf) {
  const png = PNG.sync.read(buf);
  // Normalise fully transparent pixels so encodings and comparisons are stable.
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] === 0) d[i] = d[i + 1] = d[i + 2] = 0;
  return { width: png.width, height: png.height, data: d };
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Apply PNG filters to raw scanlines. mode 'none' or 'adaptive'. bpp = bytes per pixel (>=1). */
function filterScanlines(raw, rowBytes, height, bpp, mode) {
  const out = Buffer.alloc((rowBytes + 1) * height);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(rowBytes));
  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * rowBytes, (y + 1) * rowBytes);
    const prev = y > 0 ? raw.subarray((y - 1) * rowBytes, y * rowBytes) : null;
    let best = 0;
    if (mode === 'adaptive') {
      let bestSum = Infinity;
      for (let f = 0; f < 5; f++) {
        const c = cand[f];
        let sum = 0;
        for (let x = 0; x < rowBytes; x++) {
          const a = x >= bpp ? row[x - bpp] : 0;
          const b = prev ? prev[x] : 0;
          const cc = prev && x >= bpp ? prev[x - bpp] : 0;
          let v;
          switch (f) {
            case 0: v = row[x]; break;
            case 1: v = row[x] - a; break;
            case 2: v = row[x] - b; break;
            case 3: v = row[x] - ((a + b) >> 1); break;
            default: v = row[x] - paeth(a, b, cc);
          }
          v &= 0xff;
          c[x] = v;
          sum += v < 128 ? v : 256 - v;
        }
        if (sum < bestSum) { bestSum = sum; best = f; }
      }
      out[y * (rowBytes + 1)] = best;
      cand[best].copy(out, y * (rowBytes + 1) + 1);
    } else {
      out[y * (rowBytes + 1)] = 0;
      row.copy(out, y * (rowBytes + 1) + 1);
    }
  }
  return out;
}

function deflate(buf) {
  return zlib.deflateSync(buf, { level: 9, memLevel: 9, strategy: zlib.constants.Z_DEFAULT_STRATEGY });
}

/** Smallest lossless encoding we can produce (indexed when ≤256 colours, else RGBA). */
function encodeOptimal({ width, height, data }) {
  const colorIndex = new Map();
  const colors = [];
  const px = new Uint32Array(data.buffer, data.byteOffset, data.length / 4);
  // Gather colours; put translucent ones first so tRNS stays short.
  for (let i = 0; i < px.length; i++) {
    if (!colorIndex.has(px[i])) {
      colorIndex.set(px[i], -1);
      colors.push(px[i]);
      if (colors.length > 256) break;
    }
  }
  const candidates = [];
  if (colors.length <= 256) {
    const withAlpha = colors.map((c) => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(c);
      return { c, r: b[0], g: b[1], bl: b[2], a: b[3] };
    });
    withAlpha.sort((x, y) => (x.a === 255) - (y.a === 255) || x.a - y.a);
    withAlpha.forEach((e, i) => colorIndex.set(e.c, i));
    const n = withAlpha.length;
    const bitDepth = n <= 2 ? 1 : n <= 4 ? 2 : n <= 16 ? 4 : 8;
    const rowBytes = Math.ceil((width * bitDepth) / 8);
    const raw = Buffer.alloc(rowBytes * height);
    const perByte = 8 / bitDepth;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = colorIndex.get(px[y * width + x]);
        if (bitDepth === 8) raw[y * rowBytes + x] = idx;
        else {
          const byte = y * rowBytes + Math.floor(x / perByte);
          const shift = 8 - bitDepth * ((x % perByte) + 1);
          raw[byte] |= idx << shift;
        }
      }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = bitDepth; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const plte = Buffer.alloc(n * 3);
    withAlpha.forEach((e, i) => { plte[i * 3] = e.r; plte[i * 3 + 1] = e.g; plte[i * 3 + 2] = e.bl; });
    const trnsLen = withAlpha.findIndex((e) => e.a === 255);
    const trns = Buffer.from(withAlpha.slice(0, trnsLen === -1 ? n : trnsLen).map((e) => e.a));
    for (const mode of ['none', 'adaptive']) {
      const idat = deflate(filterScanlines(raw, rowBytes, height, 1, mode));
      candidates.push(Buffer.concat([
        PNG_SIG, chunk('IHDR', ihdr), chunk('PLTE', plte),
        ...(trns.length ? [chunk('tRNS', trns)] : []),
        chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
      ]));
    }
  } else {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const idat = deflate(filterScanlines(Buffer.from(data.buffer, data.byteOffset, data.length), width * 4, height, 4, 'adaptive'));
    candidates.push(Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
  }
  candidates.sort((a, b) => a.length - b.length);
  const best = candidates[0];
  // Paranoia: verify the round trip is pixel-exact.
  const check = decodePng(best);
  if (check.width !== width || check.height !== height || Buffer.compare(check.data, data) !== 0) {
    throw new Error('PNG re-encode round trip mismatch');
  }
  return best;
}

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
};

/** Same algorithm as the runtime recolourer (index-wise palette map, ±1 tolerance). */
function recolorPixels(data, source, target) {
  const pairs = source.map((s, i) => [hexToRgb(s), hexToRgb(target[i])]);
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    for (const [s, t] of pairs) {
      if (Math.abs(out[i] - s[0]) <= 1 && Math.abs(out[i + 1] - s[1]) <= 1 && Math.abs(out[i + 2] - s[2]) <= 1) {
        out[i] = t[0]; out[i + 1] = t[1]; out[i + 2] = t[2];
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Upstream data model
// ---------------------------------------------------------------------------

function loadDefinitions(tree) {
  const defs = new Map();
  const files = [...tree.keys()].filter((p) => p.startsWith('sheet_definitions/') && p.endsWith('.json'));
  const blobs = readBlobs(files.map((f) => tree.get(f)));
  for (const f of files) {
    const base = path.basename(f, '.json');
    if (base.startsWith('meta_')) continue;
    if (defs.has(base)) throw new Error(`Duplicate sheet definition key ${base}: ${defs.get(base).file} / ${f}`);
    defs.set(base, { file: f, def: JSON.parse(blobs.get(tree.get(f)).toString('utf8')) });
  }
  return defs;
}

function loadPalettes(tree) {
  const files = [...tree.keys()].filter((p) => p.startsWith('palette_definitions/') && p.endsWith('.json'));
  const blobs = readBlobs(files.map((f) => tree.get(f)));
  const materials = {};
  const versions = {};
  for (const f of files) {
    const name = path.basename(f, '.json');
    const json = JSON.parse(blobs.get(tree.get(f)).toString('utf8'));
    if (name.startsWith('meta_')) {
      const id = name.slice(5);
      if (json.type === 'material') {
        materials[id] = { ...(materials[id] || { versions: {} }), label: json.label, desc: json.desc, default: json.default, base: json.base };
      } else versions[id] = { label: json.label, desc: json.desc };
    } else {
      const [mat, ver] = name.split('_');
      materials[mat] = materials[mat] || { versions: {} };
      materials[mat].versions = materials[mat].versions || {};
      materials[mat].versions[ver] = json;
    }
  }
  return { materials, versions };
}

function normalizeRecolors(def, palettes) {
  if (!def.recolors) return [];
  const entries = [];
  for (let n = 1; n < 10; n++) {
    const c = def.recolors[`color_${n}`];
    if (!c) break;
    entries.push(c);
  }
  if (!entries.length) entries.push(def.recolors);
  return entries.map((r) => {
    const mat = palettes.materials[r.material];
    if (!mat) throw new Error(`Unknown palette material ${r.material}`);
    let base = r.base || `${mat.default}.${mat.base}`;
    if (!base.includes('.')) base = `${mat.default}.${base}`;
    const [bver, bname] = base.split('.');
    const source = r.source || mat.versions[bver]?.[bname];
    if (!source) throw new Error(`Base palette ${r.material}.${base} not found`);
    const tokens = (r.palettes || [mat.default]).map((t) => (t.includes('.') ? t : `${r.material}.${t}`));
    return {
      material: r.material,
      base,
      source,
      palettes: tokens,
      label: r.label || mat.label,
      typeName: r.type_name || null,
    };
  });
}

function slotFor(key, def) {
  const rules = [
    [/^body$|^body_/, 'body'], [/^shadow$/, 'shadow'], [/^heads_/, 'head'], [/^head_ears_/, 'ears'],
    [/^eyebrows_/, 'eyebrows'], [/^hair_/, 'hair'], [/^beards_/, 'beard'], [/^torso_|^dress_/, 'torso'],
    [/^cape_/, 'cape'], [/^belt_|^buckles/, 'waist'], [/^arms_gloves/, 'hands'], [/^arms_|^wrists_/, 'arms'],
    [/^shoulders_|^bauldron/, 'shoulders'], [/^legs_/, 'legs'], [/^feet_/, 'feet'],
    [/^hat_visor_/, 'visor'], [/^hat_accessory_/, 'hat_accessory'], [/^hat_|^facial_mask/, 'hat'],
    [/^neck_/, 'neck'], [/^weapon_ranged_bow_arrow/, 'ammo'], [/^weapon_/, 'weapon'], [/^shield_/, 'shield'],
    [/^quiver$|^backpack/, 'back'],
  ];
  for (const [re, slot] of rules) if (re.test(key)) return slot;
  return def.type_name || 'misc';
}

function displayName(key, def, over) {
  if (over.name) return over.name;
  return def.name;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

const WANTED_CUSTOM = new Set(config.customAnimations);

function curatedKeys() {
  const keys = [];
  const seen = new Set();
  for (const [group, list] of Object.entries(config.groups)) {
    for (const k of list) {
      if (seen.has(k)) throw new Error(`Duplicate curated key ${k}`);
      seen.add(k);
      keys.push({ key: k, group });
    }
  }
  return ONLY ? keys.filter((k) => ONLY.includes(k.key)) : keys;
}

/**
 * Resolve an item into layers with path templates. `{v}` marks the variant file name.
 * Only files that exist in the upstream tree are kept.
 */
function planItem(key, group, defEntry, palettes) {
  const { def, file } = defEntry;
  const over = config.overrides[key] || {};
  const listed = new Set((def.animations || ANIMATION_DEFAULTS).map((a) => ANIM_ALIASES[a] || a));
  const recolor = normalizeRecolors(def, palettes);
  const variants = def.variants ? def.variants.slice() : null;
  const layers = [];
  for (let n = 1; n < 10; n++) {
    const l = def[`layer_${n}`];
    if (!l) break;
    const layer = { n, z: l.zPos ?? 100, custom: l.custom_animation || null, templates: {}, bases: {} };
    if (layer.custom && !WANTED_CUSTOM.has(layer.custom)) {
      warn(`${key}: layer_${n} uses custom animation ${layer.custom} which is not imported; skipped`);
      continue;
    }
    for (const body of config.bodyTypes) {
      const base = l[body];
      if (!base) continue;
      const t = {};
      if (layer.custom) {
        // Upstream names custom sheets `<base><variant>.png`; palette-only custom layers have no
        // stable file name, so they are not supported (none are curated).
        if (!variants) throw new Error(`${key}: custom-animation layer without file variants is unsupported`);
        t[layer.custom] = `${base}{v}.png`;
      } else {
        for (const anim of config.animations) {
          if (!listed.has(anim)) continue;
          t[anim] = variants ? `${base}${anim}/{v}.png` : `${base}${anim}.png`;
        }
      }
      layer.templates[body] = t;
      layer.bases[body] = base;
    }
    layers.push(layer);
  }
  const layer1Bodies = config.bodyTypes.filter((b) => def.layer_1?.[b]);
  return { key, group, file, def, over, recolor, variants, layers, bodies: layer1Bodies, slot: slotFor(key, def) };
}

const fileFor = (template, variant) => 'spritesheets/' + template.replaceAll('{v}', variant == null ? '' : variant.replaceAll(' ', '_'));

/** Every (layer, body, anim, template) of an item. */
function* templatesOf(item) {
  for (const layer of item.layers) for (const [body, t] of Object.entries(layer.templates)) for (const [anim, tpl] of Object.entries(t)) yield { layer, body, anim, tpl };
}

function chooseVariants(item, pool, cap) {
  const over = item.over;
  if (over.variants) {
    for (const v of over.variants) if (!item.variants.includes(v)) throw new Error(`${item.key}: override variant "${v}" not in ${item.variants.join(', ')}`);
    return over.variants.slice(0, cap);
  }
  const chosen = [];
  const self = item.variants.find((v) => item.key.endsWith('_' + v.replaceAll(' ', '_')) || v === item.key);
  if (self && pool.includes(self)) chosen.push(self);
  for (const pref of config.variantPreference) if (pool.includes(pref) && !chosen.includes(pref)) chosen.push(pref);
  for (const v of pool) if (!chosen.includes(v)) chosen.push(v);
  return chosen.slice(0, cap);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  ensureRepo();
  log(`LPC source: ${GEN_DIR} @ ${REF.slice(0, 10)}`);
  const tree = listTree(['sheet_definitions', 'palette_definitions', 'spritesheets']);
  fetchBlobs([...tree].filter(([p]) => !p.startsWith('spritesheets/')).map(([, oid]) => oid));
  const defs = loadDefinitions(tree);
  const palettes = loadPalettes(tree);

  const keys = curatedKeys();
  const missingKeys = keys.filter((k) => !defs.has(k.key)).map((k) => k.key);
  if (missingKeys.length) throw new Error(`Unknown curated keys: ${missingKeys.join(', ')}`);

  const items = keys.map(({ key, group }) => planItem(key, group, defs.get(key), palettes));

  // Licence screen: never import NC / ND assets; every item must carry credits.
  for (const it of items) {
    if (!(it.def.credits || []).length) throw new Error(`${it.key}: no credits`);
    for (const c of it.def.credits) {
      for (const lic of c.licenses || []) {
        if (/\bNC\b|\bND\b|non-?commercial|no ?deriv/i.test(lic)) throw new Error(`${it.key}: licence ${lic} not allowed`);
      }
    }
  }

  // --- Standard animation geometry (from the body sheets) -------------------------------------
  const customDefs = loadCustomAnimations();
  const animGeo = {};
  {
    const bodyFiles = [];
    for (const anim of config.animations) for (const body of config.bodyTypes) {
      const f = `spritesheets/body/bodies/${body}/${anim}.png`;
      if (tree.has(f)) bodyFiles.push(f);
    }
    if (!PLAN_ONLY) fetchBlobs(bodyFiles.map((f) => tree.get(f)));
    const blobs = PLAN_ONLY ? new Map() : readBlobs(bodyFiles.map((f) => tree.get(f)));
    for (const anim of config.animations) {
      let frames = 0;
      for (const f of bodyFiles.filter((b) => b.endsWith(`/${anim}.png`))) {
        const buf = blobs.get(tree.get(f));
        if (buf) frames = Math.max(frames, buf.readUInt32BE(16) / 64);
      }
      if (!frames && !PLAN_ONLY) throw new Error(`No body sheet for ${anim}`);
      animGeo[anim] = { frameSize: 64, frames, rows: SINGLE_ROW_ANIMS.has(anim) ? 1 : 4 };
    }
    for (const name of config.customAnimations) {
      const d = customDefs[name];
      if (!d) throw new Error(`custom animation ${name} not found upstream`);
      if (d.single) throw new Error(`custom animation ${name} uses single-animation sources (unsupported)`);
      animGeo[name] = {
        frameSize: d.frameSize,
        frames: d.frames[0].length,
        rows: d.frames.length,
        base: d.frames[0][0].split(',')[0].split('-')[0],
        cells: d.frames,
      };
    }
  }

  // --- Palette conversion of file-variant items ------------------------------------------------
  const conv = config.paletteConversion;
  const convCandidates = [];
  const verifyFiles = new Set();
  for (const it of items) {
    if (!it.variants || it.recolor.length || it.over.paletteConvert === false || it.over.variants) continue;
    for (const [material, baseName] of Object.entries(conv.materials)) {
      const names = Object.keys(palettes.materials[material].versions.ulpc);
      const pool = it.variants.filter((v) => names.includes(v));
      if (!it.variants.includes(baseName) || pool.length < conv.minMatchingVariants) continue;
      // Verify: walk (and custom sheets) for every palette variant; every anim for a few of them.
      const deep = new Set(pool.filter((v) => v !== baseName).slice(0, 3));
      const checks = [];
      for (const { anim, tpl } of templatesOf(it)) {
        const baseFile = fileFor(tpl, baseName);
        if (!tree.has(baseFile)) continue;
        for (const v of pool) {
          if (v === baseName) continue;
          if (!(anim === 'walk' || it.layers.some((l) => l.custom === anim) || deep.has(v))) continue;
          const vf = fileFor(tpl, v);
          if (!tree.has(vf)) continue;
          checks.push({ baseFile, vf, v });
          verifyFiles.add(baseFile).add(vf);
        }
      }
      convCandidates.push({ it, material, baseName, pool, checks });
      break;
    }
  }
  const conversionReport = [];
  if (!PLAN_ONLY && verifyFiles.size) {
    log(`Verifying ${convCandidates.length} palette-conversion candidates (${verifyFiles.size} files) …`);
    fetchBlobs([...verifyFiles].map((f) => tree.get(f)));
  }
  for (const { it, material, baseName, pool, checks } of convCandidates) {
    if (PLAN_ONLY) { conversionReport.push(`${it.key}: candidate ${material} (${pool.length} variants, unverified)`); continue; }
    const pal = palettes.materials[material].versions.ulpc;
    const blobs = readBlobs([...new Set(checks.flatMap((c) => [tree.get(c.baseFile), tree.get(c.vf)]))]);
    const dec = new Map();
    const get = (f) => {
      if (!dec.has(f)) dec.set(f, decodePng(blobs.get(tree.get(f))));
      return dec.get(f);
    };
    const worstBy = new Map();
    for (const c of checks) {
      const a = get(c.baseFile);
      const b = get(c.vf);
      let ratio = 1;
      if (a.width === b.width && a.height === b.height) {
        const re = recolorPixels(a.data, pal[baseName], pal[c.v]);
        let diff = 0, opaque = 0;
        for (let i = 0; i < re.length; i += 4) {
          if (re[i + 3] || b.data[i + 3]) opaque++;
          if (re[i] !== b.data[i] || re[i + 1] !== b.data[i + 1] || re[i + 2] !== b.data[i + 2] || re[i + 3] !== b.data[i + 3]) diff++;
        }
        ratio = opaque ? diff / opaque : 0;
      }
      worstBy.set(c.v, Math.max(worstBy.get(c.v) ?? 0, ratio));
    }
    const ok = pool.filter((v) => v === baseName || (worstBy.has(v) && worstBy.get(v) <= conv.maxMismatchRatio));
    const failed = pool.filter((v) => !ok.includes(v));
    const worstOk = Math.max(0, ...ok.map((v) => worstBy.get(v) ?? 0));
    if (ok.length >= Math.max(conv.minMatchingVariants, Math.ceil(pool.length * 0.75))) {
      it.converted = { material, baseName, failed };
      conversionReport.push(`${it.key}: → ${material} palette (base ${baseName}; ${ok.length}/${pool.length} verified exact (worst ${(worstOk * 100).toFixed(3)}%)` +
        (failed.length ? `; kept as files: ${failed.join(', ')}` : '') + ')');
    } else {
      conversionReport.push(`${it.key}: kept as file variants (${material}: only ${ok.length}/${pool.length} match)`);
    }
  }

  // --- Resolve final files -------------------------------------------------------------------------
  const outputs = new Map(); // repo path → { oid, items:Set, anim }
  const catalogItems = {};
  for (const it of items) {
    let shipped = null;
    let recolorVariant = null;
    let recolor = it.recolor;
    if (it.variants) {
      it.variants = [...new Set(it.variants)];
      if (it.converted) {
        const { material, baseName, failed } = it.converted;
        const mat = palettes.materials[material];
        recolorVariant = baseName;
        // Variants that are not exact palette swaps ship as files so every upstream colour stays exact.
        const extras = [...failed, ...(it.over.extraVariants || [])].filter((v, i, a) => it.variants.includes(v) && a.indexOf(v) === i);
        shipped = [baseName, ...extras];
        recolor = [{
          material,
          base: `ulpc.${baseName}`,
          source: mat.versions.ulpc[baseName],
          palettes: [`${material}.ulpc`, ...(mat.versions.lpcr ? [`${material}.lpcr`] : []), 'all.lpcr'],
          label: mat.label,
          typeName: null,
        }];
      } else {
        shipped = chooseVariants(it, it.variants, config.variantCap);
      }
    }
    const layersOut = [];
    const bodiesWithFiles = new Set();
    for (const layer of it.layers) {
      const paths = {};
      const anims = {};
      for (const [body, t] of Object.entries(layer.templates)) {
        for (const [anim, tpl] of Object.entries(t)) {
          const vs = shipped || [null];
          const present = vs.filter((v) => tree.has(fileFor(tpl, v)));
          if (!present.length) continue;
          if (present.length !== vs.length) {
            warn(`${it.key}: ${body}/${anim} layer_${layer.n} missing variants ${vs.filter((v) => !present.includes(v)).join(', ')}`);
          }
          for (const v of present) {
            const f = fileFor(tpl, v);
            if (!outputs.has(f)) outputs.set(f, { oid: tree.get(f), items: new Set(), anim });
            outputs.get(f).items.add(it.key);
          }
          paths[body] = layer.bases[body];
          (anims[body] ||= []).push(anim);
          bodiesWithFiles.add(body);
        }
      }
      const bodies = Object.keys(anims);
      if (!bodies.length) continue;
      const same = bodies.every((b) => anims[b].join() === anims[bodies[0]].join());
      layersOut.push({
        z: layer.z,
        ...(layer.custom ? { custom: layer.custom } : {}),
        paths,
        anims: same ? anims[bodies[0]] : anims,
      });
    }
    const bodies = it.bodies.filter((b) => bodiesWithFiles.has(b));
    if (!bodies.length) { warn(`${it.key}: no files for any body type — skipped`); continue; }
    const over = it.over;
    const entry = {
      name: displayName(it.key, it.def, over),
      category: it.file.split('/')[1],
      group: it.group,
      slot: it.slot,
      type: it.def.type_name,
      ...(it.def.tags ? { tags: it.def.tags } : {}),
      ...(it.def.required_tags ? { requires: it.def.required_tags } : {}),
      bodies,
      ...(it.def.match_body_color ? { matchBodyColor: true } : {}),
      ...(recolor.length ? { recolor } : {}),
      ...(shipped ? { variants: shipped } : {}),
      ...(recolorVariant ? { recolorVariant } : {}),
      defaultColor: recolorVariant ?? (shipped ? shipped[0] : recolor[0]?.base.split('.')[1]),
      layers: layersOut,
      ...(over.weapon ? { weapon: over.weapon } : {}),
      ...(over.attack ? { attack: over.attack } : {}),
      ...(over.with ? { with: over.with } : {}),
      licenses: [...new Set((it.def.credits || []).flatMap((c) => c.licenses || []))].sort(),
      source: it.file,
    };
    if (!entry.defaultColor) delete entry.defaultColor;
    catalogItems[it.key] = entry;
  }
  for (const [k, e] of Object.entries(catalogItems)) for (const w of e.with || []) if (!catalogItems[w]) warn(`${k}: companion ${w} not imported`);

  log(`Resolved ${Object.keys(catalogItems).length} items → ${outputs.size} PNG files.`);
  for (const line of conversionReport) log('  ' + line);
  if (PLAN_ONLY) { printWarnings(); return; }

  // --- Fetch, normalise grid, optimise, write ---------------------------------------------------------
  fetchBlobs([...outputs.values()].map((o) => o.oid));
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let srcBytes = 0, outBytes = 0, n = 0;
  const written = new Set();
  const normalised = [];
  const paths = [...outputs.keys()].sort();
  for (let i = 0; i < paths.length; i += 400) {
    const batch = paths.slice(i, i + 400);
    const blobs = readBlobs(batch.map((p) => outputs.get(p).oid));
    for (const p of batch) {
      const { oid, anim } = outputs.get(p);
      const g = animGeo[anim];
      const W = g.frameSize * g.frames, H = g.frameSize * g.rows;
      const src = blobs.get(oid);
      srcBytes += src.length;
      const cachePath = path.join(CACHE_DIR, `${oid}-${W}x${H}.png`);
      let enc;
      if (fs.existsSync(cachePath)) enc = fs.readFileSync(cachePath);
      else {
        let img = decodePng(src);
        if (img.width !== W || img.height !== H) {
          const lost = opaqueOutside(img, W, H);
          if (lost) warn(`${p.slice(13)}: cropping ${lost} opaque pixels outside the ${anim} grid (unused upstream too)`);
          img = fitGrid(img, W, H);
        }
        enc = encodeOptimal(img);
        fs.writeFileSync(cachePath, enc);
      }
      const sw = src.readUInt32BE(16), sh = src.readUInt32BE(20);
      if (sw !== W || sh !== H) normalised.push(`${p.slice(13)}: ${sw}×${sh} → ${W}×${H} (${anim})`);
      outBytes += enc.length;
      const rel = p.slice('spritesheets/'.length);
      const dest = path.join(OUT_DIR, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (!fs.existsSync(dest) || !fs.readFileSync(dest).equals(enc)) fs.writeFileSync(dest, enc);
      written.add(rel);
      n++;
    }
    process.stdout.write(`\r  optimised ${n}/${paths.length}`);
  }
  process.stdout.write('\n');
  if (normalised.length) {
    log(`Normalised ${normalised.length} sheets to the standard frame grid (extra empty columns cropped / short sheets padded):`);
    const groups = new Map();
    for (const s of normalised) {
      const k = s.replace(/\/[^/]+\.png:/, '/*:');
      groups.set(k, (groups.get(k) || 0) + 1);
    }
    for (const [k, c] of groups) log(`  ${k}${c > 1 ? `  (×${c})` : ''}`);
  }

  // --- Broken-art screen ------------------------------------------------------------------------------
  // Clothing that must cover the body (torso/legs/feet) occasionally ships sheets with whole frames
  // missing upstream (e.g. muscular wide-pants thrust). Drawing those makes the character flicker
  // naked, so such animations are dropped for that body: the game then falls back to another anim.
  {
    const occ = (img) => {
      const rows = img.height / 64, cols = img.width / 64, o = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        let hit = 0;
        for (let y = r * 64; y < (r + 1) * 64 && !hit; y++) for (let x = c * 64; x < (c + 1) * 64; x++) if (img.data[(y * img.width + x) * 4 + 3]) { hit = 1; break; }
        o.push(hit);
      }
      return o;
    };
    const bodyOcc = new Map();
    const dropped = [];
    for (const [k, e] of Object.entries(catalogItems)) {
      if (!['torso', 'legs', 'feet'].includes(e.slot)) continue;
      for (const layer of e.layers) {
        if (layer.custom) continue;
        for (const [body, dir] of Object.entries(layer.paths)) {
          if (/\/(bg|behind|background)\//.test(dir)) continue;
          const anims = Array.isArray(layer.anims) ? layer.anims : layer.anims[body];
          for (const anim of [...anims]) {
            const v = e.variants ? (e.recolorVariant ?? e.variants[0]).replaceAll(' ', '_') : null;
            const rel = `${dir}${anim}${v ? '/' + v : ''}.png`;
            const bodyRel = `body/bodies/${body}/${anim}.png`;
            if (!written.has(rel) || !written.has(bodyRel)) continue;
            if (!bodyOcc.has(bodyRel)) bodyOcc.set(bodyRel, occ(decodePng(fs.readFileSync(path.join(OUT_DIR, bodyRel)))));
            const bo = bodyOcc.get(bodyRel);
            const io = occ(decodePng(fs.readFileSync(path.join(OUT_DIR, rel))));
            let gaps = 0, tot = 0;
            bo.forEach((b, i) => { if (b) { tot++; if (!io[i]) gaps++; } });
            if (tot && gaps / tot > 0.25) {
              const per = Array.isArray(layer.anims) ? Object.fromEntries(Object.keys(layer.paths).map((b) => [b, [...layer.anims]])) : layer.anims;
              per[body] = per[body].filter((a) => a !== anim);
              const bodies = Object.keys(per);
              layer.anims = bodies.every((b) => per[b].join() === per[bodies[0]].join()) ? per[bodies[0]] : per;
              dropped.push(`${k} ${body}/${anim} (${gaps}/${tot} frames empty)`);
            }
          }
        }
      }
    }
    if (dropped.length) {
      log(`Dropped ${dropped.length} clothing animations with missing frames upstream:`);
      for (const d of dropped) log('  ' + d);
      // Forget files that are no longer referenced.
      const referenced = new Set();
      for (const e of Object.values(catalogItems)) for (const layer of e.layers) for (const [body, dir] of Object.entries(layer.paths)) {
        const anims = Array.isArray(layer.anims) ? layer.anims : layer.anims[body] ?? [];
        for (const anim of anims) for (const v of e.variants ?? [null]) {
          const vv = v ? v.replaceAll(' ', '_') : '';
          referenced.add(layer.custom ? `${dir}${vv}.png` : vv ? `${dir}${anim}/${vv}.png` : `${dir}${anim}.png`);
        }
      }
      for (const r of [...written]) if (!referenced.has(r)) written.delete(r);
    }
  }

  // --- Stale file cleanup ------------------------------------------------------------------------------
  if (!ONLY) {
    const keep = new Set([...written].map((r) => path.join(OUT_DIR, r)));
    for (const f of ['catalog.json', 'CREDITS.md', 'CREDITS.csv']) keep.add(path.join(OUT_DIR, f));
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          walk(p);
          if (!fs.readdirSync(p).length) fs.rmdirSync(p);
        } else if (!keep.has(p)) fs.unlinkSync(p);
      }
    };
    walk(OUT_DIR);
  }

  // --- Catalogue --------------------------------------------------------------------------------------
  const paletteExport = {};
  for (const [mat, m] of Object.entries(palettes.materials)) {
    paletteExport[mat] = {
      label: m.label,
      description: m.desc,
      default: m.default,
      base: `${m.default}.${m.base}`,
      versions: Object.fromEntries(Object.entries(m.versions).filter(([v]) => v === 'ulpc' || v === 'lpcr')),
    };
  }
  const catalog = {
    version: 1,
    source: { repo: config.source.repo, commit: REF },
    frameSize: 64,
    anchor: measureAnchor(),
    directions: DIRS,
    bodyTypes: config.bodyTypes,
    animations: animGeo,
    paletteVersions: palettes.versions,
    palettes: paletteExport,
    items: catalogItems,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'catalog.json'), JSON.stringify(catalog));

  writeCredits(items.filter((it) => catalogItems[it.key]), outputs, written);

  const catBytes = fs.statSync(path.join(OUT_DIR, 'catalog.json')).size;
  log(`Wrote ${n} PNGs: ${(outBytes / 1048576).toFixed(2)} MiB (upstream ${(srcBytes / 1048576).toFixed(2)} MiB), catalog ${(catBytes / 1024).toFixed(1)} KiB.`);
  printWarnings();

  function measureAnchor() {
    // Feet anchor = bottom-centre of the opaque body in the male/female "walk" stand frame (frame 0, facing south).
    const res = {};
    for (const body of ['male', 'female', 'muscular']) {
      const img = decodePng(fs.readFileSync(path.join(OUT_DIR, `body/bodies/${body}/walk.png`)));
      const y0 = 2 * 64;
      let maxY = -1, minX = 64, maxX = -1;
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        if (img.data[((y0 + y) * img.width + x) * 4 + 3] > 0) { maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
      }
      res[body] = { bottom: maxY, left: minX, right: maxX };
    }
    const bottom = Math.max(...Object.values(res).map((r) => r.bottom));
    return { x: 32, y: bottom + 1, measured: res };
  }

  function loadCustomAnimations() {
    const src = git(['show', `${REF}:sources/custom-animations.ts`]).toString('utf8');
    const out = {};
    const re = /\n {2}(\w+): \{([\s\S]*?)\n {2}\},/g;
    let m;
    while ((m = re.exec(src))) {
      const body = m[2];
      const fsz = /frameSize:\s*(\d+)/.exec(body);
      if (!fsz) continue;
      const rows = [];
      const rowRe = /\[\s*((?:"[^"]+",?\s*)+)\]/g;
      let r;
      while ((r = rowRe.exec(body))) rows.push([...r[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
      out[m[1]] = { frameSize: Number(fsz[1]), frames: rows, single: /sourceSingleAnimation:\s*true/.test(body) };
    }
    return out;
  }
}

function opaqueOutside(img, W, H) {
  let n = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if ((x >= W || y >= H) && img.data[(y * img.width + x) * 4 + 3]) n++;
  }
  return n;
}

/** Crop (extra, unused columns/rows) or pad (short sheets) to exactly W×H, anchored top-left. */
function fitGrid(img, W, H) {
  const out = Buffer.alloc(W * H * 4);
  const w = Math.min(W, img.width), h = Math.min(H, img.height);
  for (let y = 0; y < h; y++) img.data.copy(out, y * W * 4, y * img.width * 4, (y * img.width + w) * 4);
  return { width: W, height: H, data: out };
}

function printWarnings() {
  if (warnings.length) log(`${warnings.length} warning(s).`);
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

function writeCredits(items, outputs, fileInfo) {
  const csvRows = [['filename', 'item', 'notes', 'authors', 'licenses', 'urls']];
  const md = [];
  md.push('# Sprite credits', '');
  md.push('Character sprites in this directory come from the **Liberated Pixel Cup (LPC)** community, collected by the');
  md.push(`[Universal LPC Spritesheet Character Generator](${config.source.repo.replace(/\.git$/, '')}) (commit \`${REF}\`).`);
  md.push('Files were re-encoded losslessly (indexed PNG) but are otherwise unmodified; some items are recoloured at runtime');
  md.push('using the LPC palette definitions. Generated by `tools/lpc-import.mjs` — do not edit by hand.', '');
  md.push('Most assets are multi-licensed; you may use them under any one of the listed licences. Attribution is required for');
  md.push('all CC-BY / CC-BY-SA / OGA-BY / GPL assets. Where only share-alike licences (CC-BY-SA, GPL) are offered, the');
  md.push('artwork itself (and derivatives of it) must stay under that licence. See `CREDITS.csv` for a per-file listing.', '');
  md.push('Licence texts: [CC0](https://creativecommons.org/publicdomain/zero/1.0/) · [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) · [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) · [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) · [OGA-BY 3.0](https://static.opengameart.org/OGA-BY-3.0.txt) · [GPL 2.0](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html) · [GPL 3.0](https://www.gnu.org/licenses/gpl-3.0.html)', '');
  const allAuthors = new Set();
  const sections = [];
  let uncredited = 0;
  for (const it of items) {
    const credits = it.def.credits || [];
    const files = [...outputs.entries()].filter(([, o]) => o.items.has(it.key)).map(([p]) => p.slice('spritesheets/'.length)).filter((r) => fileInfo.has(r)).sort();
    const byCredit = new Map();
    for (const f of files) {
      let best = null;
      for (const c of credits) {
        const cf = (c.file || '').replace(/\/$/, '');
        if (f === cf || f.startsWith(cf + '/') || f.startsWith(cf + '.') || (cf && f.startsWith(cf))) {
          if (!best || cf.length > best.file.replace(/\/$/, '').length) best = c;
        }
      }
      if (!best) {
        uncredited++;
        throw new Error(`No credit entry for ${f} (${it.key})`);
      }
      if (!byCredit.has(best)) byCredit.set(best, []);
      byCredit.get(best).push(f);
    }
    const lines = [`## ${catalogName(it)} — \`${it.key}\``, ''];
    for (const [c, fl] of byCredit) {
      (c.authors || []).forEach((a) => allAuthors.add(a));
      lines.push(`- **Files:** ${compactFiles(fl)}`);
      lines.push(`  - Authors: ${(c.authors || []).join(', ')}`);
      lines.push(`  - Licences: ${(c.licenses || []).join(', ')}`);
      if (c.urls?.length) lines.push(`  - Sources: ${c.urls.join(' , ')}`);
      if (c.notes) lines.push(`  - Notes: ${c.notes.replace(/\s+/g, ' ')}`);
      for (const f of fl) csvRows.push([f, it.key, c.notes || '', (c.authors || []).join(','), (c.licenses || []).join(','), (c.urls || []).join(',')]);
    }
    lines.push('');
    sections.push(lines.join('\n'));
  }
  md.push(`## All contributing artists (${allAuthors.size})`, '');
  md.push([...allAuthors].sort((a, b) => a.localeCompare(b)).join(', '), '');
  md.push(...sections);
  fs.writeFileSync(path.join(OUT_DIR, 'CREDITS.md'), md.join('\n'));
  const csv = csvRows.map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(',')).join('\n') + '\n';
  fs.writeFileSync(path.join(OUT_DIR, 'CREDITS.csv'), csv);
  if (uncredited) throw new Error(`${uncredited} files without credits`);

  function catalogName(it) {
    return displayName(it.key, it.def, it.over);
  }
}

/** "a/b/walk.png, a/b/slash.png" → "a/b/{walk,slash}.png" grouped by directory. */
function compactFiles(files) {
  const byDir = new Map();
  for (const f of files) {
    const d = path.posix.dirname(f);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(path.posix.basename(f, '.png'));
  }
  return [...byDir].map(([d, names]) => (names.length === 1 ? `\`${d}/${names[0]}.png\`` : `\`${d}/{${names.join(',')}}.png\``)).join(', ');
}

try {
  main();
} catch (e) {
  console.error('\nLPC import failed:', e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
}
