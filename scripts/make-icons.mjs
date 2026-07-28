/**
 * Genereert de app-iconen uit één SVG, zodat er geen binaire bestanden in de
 * repo staan die niemand meer kan aanpassen. Draai `npm run icons` na een
 * wijziging aan het beeldmerk hieronder.
 *
 * Het motief is hetzelfde staafdiagram als in de navigatie: drie staven die
 * oplopen, in de accentkleur op donkere inkt.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

const INK = "#191813";
const ACCENT = "#c3f53c";

/** Het beeldmerk. `bg` uit betekent transparant, voor het badge-icoon. */
function logo({ bg = true, color = ACCENT, radius = 96 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${bg ? `<rect width="512" height="512" rx="${radius}" fill="${INK}"/>` : ""}
  <g fill="${color}">
    <rect x="120" y="288" width="64" height="120" rx="12"/>
    <rect x="224" y="208" width="64" height="200" rx="12"/>
    <rect x="328" y="128" width="64" height="280" rx="12"/>
  </g>
</svg>`;
}

const targets = [
  // Beginscherm en manifest.
  { file: "icon-192.png", size: 192, svg: logo() },
  { file: "icon-512.png", size: 512, svg: logo() },
  // Maskable: iOS en Android snijden hier zelf een vorm uit, dus meer marge
  // en een gevulde achtergrond tot de rand.
  { file: "icon-maskable-512.png", size: 512, svg: logo({ radius: 0 }) },
  { file: "apple-touch-icon.png", size: 180, svg: logo({ radius: 0 }) },
  // De badge is het kleine monochrome icoontje in de statusbalk; die wordt
  // door het systeem als masker gebruikt, dus alleen vorm telt.
  { file: "badge.png", size: 96, svg: logo({ bg: false, color: "#ffffff" }) },
];

await mkdir(publicDir, { recursive: true });

for (const target of targets) {
  const png = await sharp(Buffer.from(target.svg))
    .resize(target.size, target.size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(join(publicDir, target.file), png);
  console.log(`${target.file} — ${target.size}px, ${png.length} bytes`);
}
