/**
 * Preprocesa el GTFS de DTPM y genera public/routes.json.
 *
 * Uso:
 *   npm run data
 *   npm run data -- --gtfs data/gtfs --comunas data/comunas-rm.geojson --out public/routes.json
 *
 * Se puede volver a correr cada vez que DTPM publique un GTFS nuevo:
 * basta con reemplazar el contenido de data/gtfs.
 */
import { createReadStream, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import simplify from '@turf/simplify';
import bbox from '@turf/bbox';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { lineString, point } from '@turf/helpers';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { encodePolyline } from '../src/micro/game/polyline';
import { haversineKm, lineCentroid, lineLengthKm } from '../src/micro/game/geo';
import type { LatLng, RouteData, RoutesFile } from '../src/micro/types';
import type { ScheduleFile } from '../src/shared/schedule';
import { microDayIndex } from '../src/micro/game/daily';
import { historicRoutes } from '../src/micro/game/historic';

// ---------- argumentos ----------
function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const GTFS_DIR = resolve(arg('gtfs', 'data/gtfs'));
const COMUNAS = resolve(arg('comunas', 'data/comunas-rm.geojson'));
const OUT = resolve(arg('out', 'public/micro/routes.json'));
const SCHEDULE = resolve(arg('schedule', 'public/micro/schedule.json'));
const TOLERANCE = Number(arg('tolerance', '0.0005'));
/** Metros entre muestras para detectar comunas */
const COMUNA_STEP_M = 100;
/** Muestras mínimas dentro de una comuna para contarla (evita roces de borde) */
const COMUNA_MIN_SAMPLES = 3;

// ---------- CSV ----------
/** Parser de una línea CSV con soporte de comillas (RFC 4180, sin saltos de línea embebidos). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Lee un archivo GTFS en streaming y llama `onRow` con un objeto por fila. */
async function readCsv(file: string, onRow: (row: Record<string, string>) => void): Promise<void> {
  const path = join(GTFS_DIR, file);
  if (!existsSync(path)) throw new Error(`No encuentro ${path}. ¿Descomprimiste el GTFS en ${GTFS_DIR}?`);
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (let line of rl) {
    if (!header) {
      header = parseCsvLine(line.replace(/^﻿/, '')).map((h) => h.trim());
      continue;
    }
    if (!line.trim()) continue;
    const vals = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = (vals[i] ?? '').trim();
    onRow(row);
  }
}

// ---------- reglas del juego ----------
/** Recorridos "normales": letra opcional + 2-3 dígitos, sin sufijo (c, e, n, v…). */
const ELIGIBLE_RE = /^[A-Z]?\d{2,3}$/;

function zonaDe(id: string): string {
  const m = id.match(/^([A-Z])\d/);
  return m ? m[1] : id[0];
}

function limpiarParadero(name: string): string {
  // "PD1641-Parada 7 / (M) Macul" -> "Parada 7 / (M) Macul"
  // "Parada / Est. Intermodal X" -> "Est. Intermodal X"
  return name
    .replace(/^[A-Z]{1,3}\d+\s*-\s*/, '')
    .replace(/^Parada\s*\/\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- comunas ----------
interface Comuna {
  nombre: string;
  feature: Feature<Polygon | MultiPolygon>;
  box: [number, number, number, number];
}

function cargarComunas(): Comuna[] {
  const gj = JSON.parse(readFileSync(COMUNAS, 'utf8'));
  return gj.features.map((f: Feature<Polygon | MultiPolygon>) => {
    const p = (f.properties ?? {}) as Record<string, string>;
    const nombre = p.Comuna ?? p.comuna ?? p.NOM_COMUNA ?? p.nombre ?? p.name;
    if (!nombre) throw new Error('Feature de comuna sin nombre (se espera la propiedad "Comuna")');
    return { nombre, feature: f, box: bbox(f) as Comuna['box'] };
  });
}

function muestrear(pts: LatLng[], stepKm: number): LatLng[] {
  const out: LatLng[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = haversineKm(a, b);
    if (seg === 0) continue;
    let d = stepKm - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += stepKm;
    }
    carry = seg - (d - stepKm);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function comunasDe(pts: LatLng[], comunas: Comuna[]): string[] {
  const counts = new Map<string, { n: number; first: number }>();
  const samples = muestrear(pts, COMUNA_STEP_M / 1000);
  samples.forEach(([lat, lng], idx) => {
    for (const c of comunas) {
      const [x0, y0, x1, y1] = c.box;
      if (lng < x0 || lng > x1 || lat < y0 || lat > y1) continue;
      if (booleanPointInPolygon(point([lng, lat]), c.feature)) {
        const e = counts.get(c.nombre);
        if (e) e.n++;
        else counts.set(c.nombre, { n: 1, first: idx });
        break;
      }
    }
  });
  const min = Math.min(COMUNA_MIN_SAMPLES, Math.max(1, Math.floor(samples.length / 10)));
  return [...counts.entries()]
    .filter(([, v]) => v.n >= min)
    .sort((a, b) => a[1].first - b[1].first)
    .map(([k]) => k);
}

// ---------- main ----------
async function main() {
  const t0 = Date.now();
  console.log(`GTFS: ${GTFS_DIR}`);

  // 1. routes.txt (solo buses de Red: route_type 3, agencia RM)
  const routes = new Map<string, { id: string; nombre: string }>();
  await readCsv('routes.txt', (r) => {
    if (r.route_type !== '3') return;
    if (r.agency_id && r.agency_id !== 'RM') return;
    const id = (r.route_short_name || r.route_id).trim();
    routes.set(r.route_id, { id, nombre: r.route_long_name || id });
  });
  console.log(`  ${routes.size} recorridos de bus`);

  // 2. trips.txt → shapes candidatos por recorrido (preferimos sentido ida = direction_id 0)
  const byRoute = new Map<string, Map<string, Map<string, string>>>(); // route -> dir -> shape -> trip
  await readCsv('trips.txt', (t) => {
    if (!routes.has(t.route_id) || !t.shape_id) return;
    let dirs = byRoute.get(t.route_id);
    if (!dirs) byRoute.set(t.route_id, (dirs = new Map()));
    const dir = t.direction_id || '0';
    let shapes = dirs.get(dir);
    if (!shapes) dirs.set(dir, (shapes = new Map()));
    if (!shapes.has(t.shape_id)) shapes.set(t.shape_id, t.trip_id);
  });

  const neededShapes = new Set<string>();
  const routeShapes = new Map<string, Map<string, string>>(); // route -> shape -> trip
  for (const [rid, dirs] of byRoute) {
    const s = dirs.get('0') ?? [...dirs.values()][0];
    routeShapes.set(rid, s);
    for (const sh of s.keys()) neededShapes.add(sh);
  }

  // 3. shapes.txt (solo los necesarios)
  const shapePts = new Map<string, { seq: number; p: LatLng }[]>();
  await readCsv('shapes.txt', (s) => {
    if (!neededShapes.has(s.shape_id)) return;
    let arr = shapePts.get(s.shape_id);
    if (!arr) shapePts.set(s.shape_id, (arr = []));
    arr.push({ seq: Number(s.shape_pt_sequence), p: [Number(s.shape_pt_lat), Number(s.shape_pt_lon)] });
  });
  const shapes = new Map<string, LatLng[]>();
  for (const [id, arr] of shapePts) {
    arr.sort((a, b) => a.seq - b.seq);
    shapes.set(id, arr.map((x) => x.p));
  }

  // Elegir el shape más largo por recorrido
  const chosen = new Map<string, { shapeId: string; tripId: string; pts: LatLng[]; km: number }>();
  for (const [rid, shs] of routeShapes) {
    let best: { shapeId: string; tripId: string; pts: LatLng[]; km: number } | null = null;
    for (const [shapeId, tripId] of shs) {
      const pts = shapes.get(shapeId);
      if (!pts || pts.length < 2) continue;
      const km = lineLengthKm(pts);
      if (!best || km > best.km) best = { shapeId, tripId, pts, km };
    }
    if (best) chosen.set(rid, best);
  }
  console.log(`  ${chosen.size} recorridos con trazado`);

  // 4. stop_times.txt → primer y último paradero del viaje representativo
  const tripToRoute = new Map<string, string>();
  for (const [rid, c] of chosen) tripToRoute.set(c.tripId, rid);
  const ends = new Map<string, { minSeq: number; minStop: string; maxSeq: number; maxStop: string }>();
  await readCsv('stop_times.txt', (st) => {
    if (!tripToRoute.has(st.trip_id)) return;
    const seq = Number(st.stop_sequence);
    const e = ends.get(st.trip_id);
    if (!e) ends.set(st.trip_id, { minSeq: seq, minStop: st.stop_id, maxSeq: seq, maxStop: st.stop_id });
    else {
      if (seq < e.minSeq) Object.assign(e, { minSeq: seq, minStop: st.stop_id });
      if (seq > e.maxSeq) Object.assign(e, { maxSeq: seq, maxStop: st.stop_id });
    }
  });

  // 5. stops.txt
  const neededStops = new Set<string>();
  for (const e of ends.values()) neededStops.add(e.minStop).add(e.maxStop);
  const stops = new Map<string, string>();
  await readCsv('stops.txt', (s) => {
    if (neededStops.has(s.stop_id)) stops.set(s.stop_id, limpiarParadero(s.stop_name));
  });

  // feed_info (opcional)
  let gtfsLabel = 'GTFS DTPM';
  if (existsSync(join(GTFS_DIR, 'feed_info.txt'))) {
    await readCsv('feed_info.txt', (f) => {
      const d = f.feed_start_date;
      gtfsLabel = `GTFS DTPM ${f.feed_version || ''}`.trim();
      if (d && /^\d{8}$/.test(d)) gtfsLabel += ` (desde ${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)})`;
    });
  }

  // 6. Geometría y comunas
  const comunas = cargarComunas();
  const out: RouteData[] = [];
  for (const [rid, c] of chosen) {
    const r = routes.get(rid)!;
    const simp = simplify(lineString(c.pts.map(([la, ln]) => [ln, la])), {
      tolerance: TOLERANCE,
      highQuality: true,
    });
    const simpPts = simp.geometry.coordinates.map(([ln, la]) => [la, ln] as LatLng);
    const e = ends.get(c.tripId);
    const centro = lineCentroid(c.pts);
    out.push({
      id: r.id,
      nombre: r.nombre,
      shape: encodePolyline(simpPts),
      comunas: comunasDe(c.pts, comunas),
      centroide: [round(centro[0], 5), round(centro[1], 5)],
      largoKm: round(c.km, 1),
      origen: (e && stops.get(e.minStop)) || '',
      destino: (e && stops.get(e.maxStop)) || '',
      zona: zonaDe(r.id),
      elegible: ELIGIBLE_RE.test(r.id),
    });
  }

  out.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));

  // Ids duplicados: nos quedamos con el primero
  const seen = new Set<string>();
  const routesOut = out.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));

  // 7. Recorridos históricos: si un recorrido que es respuesta de un día ya congelado
  //    desapareció del GTFS, se conserva tal como estaba (mismo shape) para esos días.
  const historicos = keepHistoricRoutes(routesOut);
  if (historicos.length) {
    routesOut.push(...historicos);
    routesOut.sort((a, b) => a.id.localeCompare(b.id, 'es', { numeric: true }));
    console.log(`  ${historicos.length} recorrido(s) histórico(s) conservado(s): ${historicos.map((r) => r.id).join(', ')}`);
  }

  const file: RoutesFile = {
    version: new Date().toISOString().slice(0, 10),
    gtfs: gtfsLabel,
    routes: routesOut,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  const json = JSON.stringify(file);
  writeFileSync(OUT, json);

  const eleg = routesOut.filter((r) => r.elegible).length;
  const sinComuna = routesOut.filter((r) => r.comunas.length === 0).map((r) => r.id);
  console.log(`  ${routesOut.length} recorridos exportados (${eleg} elegibles como respuesta)`);
  if (sinComuna.length) console.warn(`  ⚠ sin comunas detectadas: ${sinComuna.join(', ')}`);
  console.log(`  → ${OUT} (${(json.length / 1024).toFixed(0)} KB) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

/**
 * Devuelve los recorridos del routes.json anterior que son respuesta de algún día
 * congelado del schedule y ya no vienen en el GTFS nuevo (marcados historico: true).
 */
function keepHistoricRoutes(current: RouteData[]): RouteData[] {
  if (!existsSync(OUT) || !existsSync(SCHEDULE)) return [];
  const prev: RoutesFile = JSON.parse(readFileSync(OUT, 'utf8'));
  const sched: ScheduleFile = JSON.parse(readFileSync(SCHEDULE, 'utf8'));
  // Los históricos que ya estaban en el archivo anterior también se conservan
  return historicRoutes(prev.routes, current, sched, microDayIndex());
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
