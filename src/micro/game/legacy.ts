/**
 * Algoritmo con el que Microdle eligió la respuesta del día ANTES del schedule
 * append-only (lanzamiento 2026-11-09). Solo lo usa scripts/schedule.ts para
 * congelar exactamente las respuestas ya publicadas al migrar. No va al bundle.
 */
import type { RouteData } from '../types';
import { hashString, seededShuffle } from '../../shared/rng';

/**
 * Último día (índice) que la versión anterior pudo publicar en producción.
 * Producción corrió el algoritmo viejo desde el día 0 (2026-11-09) hasta el
 * despliegue del schedule el día 2 (2026-11-11). Se congela además el día 3
 * (mañana) por si el despliegue se atrasara pasada la medianoche.
 * Estos días se copian del algoritmo viejo al schedule y nunca cambian.
 */
export const MICRO_LEGACY_UNTIL = 3;

const LEGACY_SEED = 'μ-scl·' + [0x6d, 0x69, 0x63, 0x72, 0x6f].map((c) => String.fromCharCode(c)).join('');

export function legacyAnswerForDay(routes: RouteData[], day: number): string {
  const pool = routes
    .filter((r) => r.elegible && !r.historico)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = pool.length;
  const d = ((day % n) + n) % n;
  const cycle = Math.floor(day / n);
  return seededShuffle(pool, hashString(`${LEGACY_SEED}:${cycle}`))[d].id;
}
