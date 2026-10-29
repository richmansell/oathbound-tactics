// Generates app icons (navy field, gilt lantern-crest) for the web manifest and native wrappers.
import { PNG } from 'pngjs';
import fs from 'fs';
function icon(size, file, maskable = false) {
  const png = new PNG({ width: size, height: size });
  const c = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const dx = (x - c) / c, dy = (y - c) / c;
    const r = Math.hypot(dx, dy);
    // background radial navy
    let col = [Math.round(14 + 20 * (1 - r)), Math.round(22 + 26 * (1 - r)), Math.round(48 + 40 * (1 - r))];
    const s = maskable ? 0.62 : 0.78;
    // hexagonal crest border
    const hx = Math.max(Math.abs(dx) * 0.866 + Math.abs(dy) * 0.5, Math.abs(dy));
    if (hx < s && hx > s - 0.07) col = [216, 180, 90];
    // lantern body
    const lx = Math.abs(dx), ly = dy;
    if (ly > -0.32 && ly < 0.3 && lx < 0.2 - Math.max(0, ly - 0.15) * 0.4) col = [240, 216, 144];
    if (ly > -0.26 && ly < 0.24 && lx < 0.13) { const g = 1 - Math.hypot(dx, dy + 0.0) * 2.4; col = [255, Math.round(170 + 60 * Math.max(0, g)), Math.round(60 + 80 * Math.max(0, g))]; }
    if (ly > -0.42 && ly < -0.32 && lx < 0.08) col = [216, 180, 90];
    if (Math.abs(Math.hypot(dx, dy + 0.48) - 0.08) < 0.025 && dy < -0.44) col = [216, 180, 90];
    if (ly > 0.3 && ly < 0.36 && lx < 0.24) col = [216, 180, 90];
    png.data[i] = col[0]; png.data[i + 1] = col[1]; png.data[i + 2] = col[2]; png.data[i + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
}
icon(192, 'public/icons/icon-192.png');
icon(512, 'public/icons/icon-512.png');
icon(512, 'public/icons/icon-maskable-512.png', true);
icon(180, 'public/icons/apple-touch-icon.png');
console.log('icons written');
