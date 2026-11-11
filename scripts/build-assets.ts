/**
 * Genera íconos, manifest PWA e imagen Open Graph a partir de SVG.
 * Requiere public/micro/routes.json (corre antes `npm run data`).
 *
 *   npm run assets
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { decodePolyline } from '../src/micro/game/polyline';
import type { LatLng, RoutesFile } from '../src/micro/types';
import { GAMES, HUB } from '../src/shared/config';

const PUB = resolve('public');

// ---------- Ícono: micro estilizada de frente ----------
const icon = (opts: { padded?: boolean } = {}) => {
  // padded = versión "maskable": el contenido vive en el 80% central
  const s = opts.padded ? 0.72 : 1;
  const o = (64 - 64 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  ${opts.padded ? '<rect width="64" height="64" fill="#6AAA64"/>' : '<rect x="2" y="2" width="60" height="60" rx="14" fill="#6AAA64"/>'}
  <g transform="translate(${o} ${o}) scale(${s})">
    <rect x="14" y="11" width="36" height="38" rx="8" fill="#fff"/>
    <rect x="18" y="15" width="28" height="4" rx="2" fill="#C9B458"/>
    <rect x="18" y="22" width="28" height="13" rx="3" fill="#1d2b2a"/>
    <circle cx="22" cy="42" r="3" fill="#C9B458"/>
    <circle cx="42" cy="42" r="3" fill="#C9B458"/>
    <rect x="17" y="49" width="7" height="6" rx="2" fill="#1d2b2a"/>
    <rect x="40" y="49" width="7" height="6" rx="2" fill="#1d2b2a"/>
  </g>
</svg>`;
};

async function png(svg: string, size: number, file: string) {
  await sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(resolve(PUB, file));
}

// ---------- Imagen OG ----------
function ogSvg(data: RoutesFile): string {
  const W = 1200;
  const H = 630;
  const routes = data.routes.map((r) => ({ r, pts: decodePolyline(r.shape) }));

  // Encuadre: zona urbana de Santiago
  const box = { minLat: -33.65, maxLat: -33.3, minLng: -70.85, maxLng: -70.5 };
  const mapX = 600;
  const mapY = 15;
  const mapW = 585;
  const mapH = 600;
  const kx = Math.cos((-33.45 * Math.PI) / 180);
  const spanX = (box.maxLng - box.minLng) * kx;
  const spanY = box.maxLat - box.minLat;
  const scale = Math.min(mapW / spanX, mapH / spanY);
  const offX = mapX + (mapW - spanX * scale) / 2;
  const offY = mapY + (mapH - spanY * scale) / 2;
  const proj = ([lat, lng]: LatLng) =>
    `${(offX + (lng - box.minLng) * kx * scale).toFixed(1)},${(offY + (box.maxLat - lat) * scale).toFixed(1)}`;
  const path = (pts: LatLng[]) => 'M' + pts.map(proj).join('L');

  // Destacamos un servicio NO elegible (nunca será respuesta): sin spoilers.
  const hero =
    routes
      .filter((x) => !x.r.elegible)
      .sort((a, b) => b.r.largoKm - a.r.largoKm)
      .find((x) => x.r.largoKm < 40) ?? routes[0];

  const network = routes
    .map((x) => `<path d="${path(x.pts)}"/>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <clipPath id="mapclip"><rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" rx="28"/></clipPath>
    <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="9" cy="9" r="1.3" fill="#2a2f2f"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="#121414"/>
  <g clip-path="url(#mapclip)">
    <rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" fill="#171a1a"/>
    <rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" fill="url(#dots)"/>
    <g fill="none" stroke="#3b4141" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.8">${network}</g>
    <path d="${path(hero.pts)}" fill="none" stroke="#0d0f0f" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${path(hero.pts)}" fill="none" stroke="#6AAA64" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
  <rect x="${mapX}" y="${mapY}" width="${mapW}" height="${mapH}" rx="28" fill="none" stroke="#2c3131" stroke-width="2"/>

  <g transform="translate(70 150) scale(1.9)">
    <rect x="2" y="2" width="60" height="60" rx="14" fill="#6AAA64"/>
    <rect x="14" y="11" width="36" height="38" rx="8" fill="#fff"/>
    <rect x="18" y="15" width="28" height="4" rx="2" fill="#C9B458"/>
    <rect x="18" y="22" width="28" height="13" rx="3" fill="#1d2b2a"/>
    <circle cx="22" cy="42" r="3" fill="#C9B458"/>
    <circle cx="42" cy="42" r="3" fill="#C9B458"/>
    <rect x="17" y="49" width="7" height="6" rx="2" fill="#1d2b2a"/>
    <rect x="40" y="49" width="7" height="6" rx="2" fill="#1d2b2a"/>
  </g>
  <g font-family="Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" fill="#ececeb">
    <text x="66" y="365" font-size="92" font-weight="800" letter-spacing="5">MICRODLE</text>
    <text x="70" y="425" font-size="38" font-weight="600" fill="#c9cdcd">Adivina la micro del día</text>
    <g transform="translate(70 470)">
      ${['#6AAA64', '#C9B458', '#787C7E']
        .map((c, i) => `<rect x="${i * 50}" y="0" width="42" height="42" rx="9" fill="${c}"/>`)
        .join('')}
      <text x="170" y="31" font-size="28" font-weight="700" fill="#a7acad">6 intentos · Santiago</text>
    </g>
    <text x="70" y="580" font-size="24" font-weight="600" fill="#7d8384">${HUB.domain}${GAMES.micro.path}</text>
  </g>
</svg>`;
}

async function main() {
  const data: RoutesFile = JSON.parse(readFileSync(resolve(PUB, 'micro/routes.json'), 'utf8'));

  const svgIcon = icon();
  writeFileSync(resolve(PUB, 'favicon.svg'), svgIcon);
  writeFileSync(resolve(PUB, 'icon.svg'), svgIcon);
  await png(svgIcon, 32, 'favicon-32.png');
  await png(svgIcon, 192, 'icon-192.png');
  await png(svgIcon, 512, 'icon-512.png');
  await png(icon({ padded: true }), 512, 'icon-maskable-512.png');
  await png(icon({ padded: true }), 180, 'apple-touch-icon.png');

  const og = ogSvg(data);
  await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toFile(resolve(PUB, 'micro/og.png'));

  const manifest = {
    name: HUB.name,
    short_name: HUB.name,
    description: HUB.description,
    lang: 'es-CL',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#121414',
    theme_color: '#6AAA64',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [{ name: GAMES.micro.title, url: `${GAMES.micro.path}/`, description: GAMES.micro.tagline }],
  };
  writeFileSync(resolve(PUB, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
  console.log('Íconos, manifest y og.png generados en public/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
