import type { RouteData } from '../types';
import { hashString, seededShuffle } from './rng';

export const TZ = 'America/Santiago';

/** Día del lanzamiento: Microdle #1. */
const EPOCH = Date.UTC(2026, 10, 9); // 2026-11-09

/**
 * Semilla del calendario. La respuesta del día NO está en el bundle ni en routes.json:
 * se calcula barajando (con esta semilla) la lista de recorridos elegibles.
 * Cambiarla reordena todo el calendario futuro y pasado.
 */
const SEED = 'μ-scl·' + [0x6d, 0x69, 0x63, 0x72, 0x6f].map((c) => String.fromCharCode(c)).join('');

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function santiagoParts(d = new Date()) {
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Índice de día (0 = lanzamiento) según el calendario de Santiago. */
export function dayIndex(now = new Date()): number {
  const p = santiagoParts(now);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day) - EPOCH) / 86_400_000);
}

/** Número público del puzzle (#1, #2, …). */
export function puzzleNumber(day: number): number {
  return day + 1;
}

/** Milisegundos hasta la próxima medianoche en Santiago (maneja cambios de horario). */
export function msUntilNextDay(now = new Date()): number {
  const today = dayIndex(now);
  const p = santiagoParts(now);
  // Estimación directa y luego ajuste fino por si hay cambio de horario esa noche.
  let ms = ((23 - p.hour) * 3600 + (59 - p.minute) * 60 + (60 - p.second)) * 1000 - now.getMilliseconds();
  if (dayIndex(new Date(now.getTime() + ms)) === today) {
    // Chile adelanta la hora a medianoche: la "medianoche" llega antes o después.
    for (const delta of [3600_000, -3600_000]) {
      if (dayIndex(new Date(now.getTime() + ms + delta)) !== today) {
        ms += delta;
        break;
      }
    }
  }
  return Math.max(0, ms);
}

export function formatCountdown(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Respuesta del día: la lista de elegibles (ordenada por id) se baraja con una semilla
 * fija por "ciclo". Dentro de un ciclo no se repite ningún recorrido; al agotarse
 * la lista empieza un ciclo nuevo con otro orden.
 */
export function answerForDay(routes: RouteData[], day: number): RouteData {
  const pool = routes
    .filter((r) => r.elegible)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = pool.length;
  const d = ((day % n) + n) % n;
  const cycle = Math.floor(day / n);
  const order = seededShuffle(pool, hashString(`${SEED}:${cycle}`));
  return order[d];
}

export function randomAnswer(routes: RouteData[], exclude?: string): RouteData {
  const pool = routes.filter((r) => r.elegible && r.id !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}
