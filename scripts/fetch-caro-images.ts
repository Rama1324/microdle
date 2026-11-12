/**
 * Descarga las fotos de fondo de ¿Qué sale más caro? desde Wikimedia Commons
 * (solo licencias libres: CC0, dominio público, CC BY, CC BY-SA) y guarda su crédito.
 *
 *   npx tsx scripts/fetch-caro-images.ts            (descarga las que faltan)
 *   npx tsx scripts/fetch-caro-images.ts --force    (vuelve a descargar todas)
 *
 * Cada concepto tiene un archivo exacto de Commons ("File:...") o una búsqueda.
 * Resultado: public/caro/img/<concepto>.webp y data/caro-images.json (créditos).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const UA = 'LaOnceBuild/1.0 (static site build script)';
const OUT_DIR = resolve('public/caro/img');
const CREDITS = resolve('data/caro-images.json');
const force = process.argv.includes('--force');

/** concepto → "File:Título exacto" o texto de búsqueda */
export const CONCEPTS: Record<string, string> = {
  streaming: 'television living room watching',
  musica: 'headphones on table',
  consola: 'gamepad controller hands playing',
  parlante: 'portable bluetooth speaker',
  fantasilandia: 'Fantasilandia Santiago',
  teatro: 'File:Teatro Municipal, Santiago 20230521 01.jpg',
  metro: 'File:Tren NS-2016 entrando a estación de Metro de Santiago.jpg',
  micro: 'Red Movilidad bus Santiago',
  bip: 'Tarjeta bip Santiago',
  uchile: 'Casa Central Universidad de Chile',
  pieza: 'File:Bedroom Make Over- Keep it simple - New Orleans.jpg',
  gimnasio: 'gym dumbbells',
  marraqueta: 'marraqueta pan batido Chile',
  hallulla: 'hallulla pan',
  bebida: 'cola soft drink bottle',
  leche: 'File:Vaso con leche, Madrid, España, 2021 01.jpg',
  palta: 'Hass avocado',
  huevos: 'eggs in carton',
  fideos: 'dry spaghetti',
  arroz: 'white rice grains',
  pisco: 'pisco sour',
  energetica: 'energy drink can',
  cerveza: 'beer cans',
};

const OK_LICENSE = /^(cc0|cc[- ]by(-sa)?[- ]?\d|public domain|pd|cc-by|cc-by-sa)/i;

interface Credit {
  archivo: string;
  autor: string;
  licencia: string;
  url: string;
}

const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** fetch con reintentos ante 429 (Commons limita la frecuencia). */
async function get(url: string): Promise<Response> {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.status !== 429 || i >= 5) {
      if (!r.ok) throw new Error(`Commons ${r.status}`);
      return r;
    }
    await new Promise((res) => setTimeout(res, 5000 * (i + 1)));
  }
}

async function api(params: Record<string, string>) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [k, v] of Object.entries({ format: 'json', action: 'query', ...params })) u.searchParams.set(k, v);
  return (await get(u.toString())).json() as Promise<any>;
}

async function candidates(query: string): Promise<any[]> {
  const common = { prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: '1200' };
  const data = query.startsWith('File:')
    ? await api({ ...common, titles: query })
    : await api({ ...common, generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '15' });
  const pages = Object.values(data.query?.pages ?? {}) as any[];
  return pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

async function pick(concept: string, query: string): Promise<{ thumb: string; credit: Credit } | null> {
  for (const p of await candidates(query)) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/image\/(jpeg|png)/.test(ii.mime) || ii.width < 900 || ii.height < 500) continue;
    const md = ii.extmetadata ?? {};
    const lic = strip(md.LicenseShortName?.value ?? '');
    if (!OK_LICENSE.test(lic)) continue;
    const autor = strip(md.Artist?.value ?? 'Autor desconocido').slice(0, 80);
    return {
      thumb: ii.thumburl ?? ii.url,
      credit: { archivo: p.title, autor, licencia: lic, url: ii.descriptionurl },
    };
  }
  console.warn(`⚠ ${concept}: sin candidato con licencia libre para "${query}"`);
  return null;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const credits: Record<string, Credit> = existsSync(CREDITS) ? JSON.parse(readFileSync(CREDITS, 'utf8')) : {};
  for (const [concept, query] of Object.entries(CONCEPTS)) {
    const file = resolve(OUT_DIR, `${concept}.webp`);
    const same = credits[concept] && (!query.startsWith('File:') || credits[concept].archivo === query);
    if (!force && existsSync(file) && same) continue;
    const got = await pick(concept, query);
    if (!got) continue;
    const r = await get(got.thumb);
    const buf = Buffer.from(await r.arrayBuffer());
    await sharp(buf).resize({ width: 960, height: 960, fit: 'inside' }).webp({ quality: 62 }).toFile(file);
    credits[concept] = got.credit;
    writeFileSync(CREDITS, JSON.stringify(credits, null, 2) + '\n');
    console.log(`✓ ${concept} ← ${got.credit.archivo} (${got.credit.licencia})`);
    await new Promise((res) => setTimeout(res, 1500));
  }
  const sorted = Object.fromEntries(Object.entries(credits).filter(([k]) => k in CONCEPTS).sort());
  writeFileSync(CREDITS, JSON.stringify(sorted, null, 2) + '\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
