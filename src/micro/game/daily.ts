import type { RouteData } from '../types';
import { GAMES } from '../../shared/config';
import { dayIndex } from '../../shared/time';
import { entryForDay, pickNoRepeat, type GenerateContext, type ScheduleFile } from '../../shared/schedule';
import { hashString } from '../../shared/rng';

export const MICRO_EPOCH = GAMES.micro.epoch;
/** Sal de ofuscación del schedule de Microdle (no es secreta: el repo es público) */
export const MICRO_SALT = 'micro-scl';

export const microDayIndex = (now = new Date()) => dayIndex(MICRO_EPOCH, now);

/** Ids que pueden ser respuesta (ordenados para que el schedule sea determinístico). */
export function answerPool(routes: RouteData[]): string[] {
  return routes
    .filter((r) => r.elegible && !r.historico)
    .map((r) => r.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Generador de días futuros: no repite un recorrido hasta agotar la lista. */
export function generateMicroDay(pool: string[]) {
  return (_day: number, ctx: GenerateContext) => [pickNoRepeat(pool, ctx.history, ctx.rng)];
}

/**
 * Respuesta del día según el schedule commiteado. Si el schedule no cubre ese día
 * (no se regeneró a tiempo), cae a una elección determinística y avisa en consola.
 */
export function answerForDay(routes: RouteData[], schedule: ScheduleFile | null, day: number): RouteData {
  const byId = new Map(routes.map((r) => [r.id, r]));
  const id = schedule ? entryForDay(schedule, day, MICRO_SALT)?.[0] : undefined;
  const hit = id ? byId.get(id) : undefined;
  if (hit) return hit;
  console.warn(`[microdle] El schedule no cubre el día ${day}: usando respaldo. Corre "npm run schedule".`);
  const pool = answerPool(routes);
  return byId.get(pool[hashString(`${MICRO_SALT}:fallback:${day}`) % pool.length])!;
}

export function randomAnswer(routes: RouteData[], exclude?: string): RouteData {
  const pool = routes.filter((r) => r.elegible && !r.historico && r.id !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}
